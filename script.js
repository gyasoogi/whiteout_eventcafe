document.addEventListener('DOMContentLoaded', function () {
    console.log('SCRIPT READY');

    const panel = document.getElementById('centerPanelToggle');
    const prompt = document.getElementById('clickPrompt');
    const container = document.getElementById('contentContainer');
    const cameraToggle = document.getElementById('cameraToggle');
    const cameraPanel = document.getElementById('cameraPanel');
    const cameraVideo = document.getElementById('cameraVideo');
    const cameraStatus = document.getElementById('cameraStatus');
    const cameraRatio = document.getElementById('cameraRatio');
    const cameraThreshold = document.getElementById('cameraThreshold');

    let step = 0;
    let faceTriggerCooldown = 0;
    let isFaceHoldLocked = false;
    let faceLostAt = null;

    function resetSystemToDefault() {
        if (!panel || !container || !prompt) return;

        step = 0;
        faceLostAt = null;
        isFaceHoldLocked = false;
        faceTriggerCooldown = 0;

        panel.classList.remove('is-visible', 'is-hidden');
        panel.style.animation = '';
        container.classList.remove('main-content-active');
        prompt.style.display = 'block';

        if (cameraPanel) {
            cameraPanel.classList.remove('is-open');
        }

        if (cameraToggle) {
            cameraToggle.classList.remove('is-open');
            cameraToggle.textContent = 'CAM ON';
        }
    }

    function triggerAutoClick() {
        if (!panel || !container) return;

        if (step === 2 && isFaceHoldLocked) {
            return;
        }

        if (step === 0) {
            prompt.style.display = 'none';
            panel.classList.add('is-visible');
            step = 1;
            return;
        }

        if (step === 1) {
            panel.style.animation = 'none';
            void panel.offsetWidth;

            requestAnimationFrame(function () {
                panel.classList.add('is-hidden');
                container.classList.add('main-content-active');
            });

            step = 2;
            return;
        }

        if (step === 2) {
            panel.classList.toggle('is-hidden');
        }
    }

    function toggleCameraPanel() {
        if (!cameraPanel || !cameraToggle) return;

        const isOpen = cameraPanel.classList.toggle('is-open');
        cameraToggle.classList.toggle('is-open', isOpen);
        cameraToggle.textContent = isOpen ? 'CAM OFF' : 'CAM ON';
    }

    if (cameraToggle) {
        cameraToggle.addEventListener('click', function (event) {
            event.stopPropagation();
            toggleCameraPanel();
        });
    }

    if (cameraPanel) {
        cameraPanel.addEventListener('click', function (event) {
            event.stopPropagation();
        });
    }

    const cameraBridgeChannel = 'camera_access_bridge';

    if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel(cameraBridgeChannel);
        channel.onmessage = function () {
            triggerAutoClick();
        };
    }

    window.addEventListener('cameraApproachDetected', function () {
        triggerAutoClick();
    });

    window.addEventListener('storage', function (event) {
        if (event.key === 'camera_access_approach') {
            triggerAutoClick();
        }
    });

    document.addEventListener('click', function (e) {
        console.log('CLICK', step);

        if (step === 0) {
            prompt.style.display = 'none';
            panel.classList.add('is-visible');

            step = 1;
            return;
        }

        if (step === 1) {
            if (panel.contains(e.target)) {
                panel.style.animation = 'none';

                void panel.offsetWidth;

                requestAnimationFrame(function () {
                    panel.classList.add('is-hidden');
                    container.classList.add('main-content-active');
                });

                step = 2;
            }

            return;
        }

        if (step === 2 && panel.contains(e.target)) {
            panel.classList.toggle('is-hidden');
        }
    });

    async function initCamera() {
        if (!cameraVideo || !cameraStatus || !cameraRatio || !cameraThreshold) {
            return;
        }

        try {
            const { FaceDetector, FilesetResolver } = window;

            if (!FaceDetector || !FilesetResolver) {
                throw new Error('MediaPipe 라이브러리가 로드되지 않았습니다. CDN 로딩 실패 또는 브라우저 보안 차단입니다.');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                },
                audio: false
            });

            cameraVideo.srcObject = stream;
            await cameraVideo.play();

            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
            );

            const detector = await FaceDetector.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
                },
                runningMode: 'VIDEO',
                minDetectionConfidence: 0.5
            });

            const calibrationRatio = 0.1245;
            const threshold = calibrationRatio * 1.0;
            let lastVideoTime = -1;

            function drawFaceBox(box) {
                const canvas = document.createElement('canvas');
                canvas.width = cameraVideo.videoWidth || 640;
                canvas.height = cameraVideo.videoHeight || 480;

                const context = canvas.getContext('2d');
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.strokeStyle = '#00ff9d';
                context.lineWidth = 3;
                context.strokeRect(box.originX, box.originY, box.width, box.height);

                cameraVideo.style.filter = 'drop-shadow(0 0 18px rgba(0,255,157,0.45))';
            }

            function detectFrame(now) {
                if (cameraVideo.readyState < 2 || cameraVideo.currentTime === lastVideoTime) {
                    requestAnimationFrame(detectFrame);
                    return;
                }

                lastVideoTime = cameraVideo.currentTime;
                const result = detector.detectForVideo(cameraVideo, now);

                if (result.detections.length === 0) {
                    if (faceLostAt === null) {
                        faceLostAt = performance.now();
                    } else if (performance.now() - faceLostAt >= 2000) {
                        isFaceHoldLocked = false;
                        cameraStatus.textContent = '상태: 대기 중...';
                        resetSystemToDefault();
                    } else {
                        cameraStatus.textContent = '상태: 감시 중...';
                    }

                    cameraRatio.textContent = '현재 얼굴 비율: 없음';
                    cameraThreshold.textContent = `접근 임계값: ${(threshold * 100).toFixed(2)}%`;
                    requestAnimationFrame(detectFrame);
                    return;
                }

                const box = result.detections[0].boundingBox;
                const faceRatio = box.width / cameraVideo.videoWidth;
                const percentRatio = (faceRatio * 100).toFixed(2);

                faceLostAt = null;
                cameraRatio.textContent = `현재 얼굴 비율: ${percentRatio}% (${faceRatio.toFixed(3)})`;
                cameraThreshold.textContent = `접근 임계값: ${(threshold * 100).toFixed(2)}%`;

                if (faceRatio >= threshold) {
                    isFaceHoldLocked = true;
                    cameraStatus.textContent = '상태: 접근 감지됨';

                    const triggerNow = performance.now();
                    if (triggerNow - faceTriggerCooldown > 2000) {
                        faceTriggerCooldown = triggerNow;
                        triggerAutoClick();
                    }
                } else {
                    isFaceHoldLocked = false;
                    cameraStatus.textContent = '상태: 감시 중';
                }

                drawFaceBox(box);
                requestAnimationFrame(detectFrame);
            }

            cameraThreshold.textContent = `접근 임계값: ${(threshold * 100).toFixed(2)}%`;
            requestAnimationFrame(detectFrame);
        } catch (error) {
            console.error('Camera init failed:', error);
            cameraStatus.textContent = `상태: 오류 - ${error.message}`;
        }
    }

    initCamera();
});
