"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Teleprompter from "@/components/teleprompter";
import { formatDuration } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    Camera, CameraOff, Mic, MicOff, Play, Pause, Square,
    RotateCcw, Upload, CheckCircle2, AlertCircle, Clock,
    Info, ArrowLeft
} from "lucide-react";

type RecordingState = "idle" | "recording" | "paused" | "review";

interface VerificationData {
    policyNumber: string;
    mobileNumber: string;
    verificationId: string;
}

function RecordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const cameraInitAttemptRef = useRef(0);

    const [state, setState] = useState<RecordingState>("idle");
    const [duration, setDuration] = useState(0);
    const [videoBlob, setVideoBlob] = useState<Blob | null>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [micError, setMicError] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
    const [cameraReady, setCameraReady] = useState(false);
    const [recoverySteps, setRecoverySteps] = useState<string[]>([]);
    const MAX_DURATION = 180; // 3 minutes max
    const cameraTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [permissionPromptShown, setPermissionPromptShown] = useState(false);
    const [diagnosticInfo, setDiagnosticInfo] = useState<string>("");

    useEffect(() => {
        const data = sessionStorage.getItem("verificationData");
        if (!data) {
            router.push("/");
            return;
        }
        setVerificationData(JSON.parse(data));
    }, [router]);

    // Detect device type
    const getDeviceInfo = () => {
        const userAgent = navigator.userAgent.toLowerCase();
        return {
            isAndroid: userAgent.includes("android"),
            isIOS: userAgent.includes("iphone") || userAgent.includes("ipad"),
            isMobile: userAgent.includes("mobile") || userAgent.includes("android") || userAgent.includes("iphone"),
            isChrome: userAgent.includes("chrome") && !userAgent.includes("edge"),
            isFirefox: userAgent.includes("firefox"),
            isSafari: userAgent.includes("safari") && !userAgent.includes("chrome"),
        };
    };

    // Check if running on HTTPS or localhost
    const isSecureContext = () => {
        return window.location.protocol === "https:" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    };

    // Run diagnostics to capture device and browser info
    const runDiagnostics = async () => {
        try {
            const device = getDeviceInfo();
            const constraints = {
                video: getVideoConstraints(),
                audio: { echoCancellation: true, noiseSuppression: true },
            };
            
            const hasGetUserMedia = navigator.mediaDevices && 'getUserMedia' in navigator.mediaDevices;
            
            const info = `Device: ${device.isAndroid ? 'Android' : device.isIOS ? 'iOS' : 'Desktop'}
Browser: ${device.isChrome ? 'Chrome' : device.isFirefox ? 'Firefox' : device.isSafari ? 'Safari' : 'Unknown'}
Secure: ${isSecureContext() ? 'Yes' : 'No'}
Constraints: ${JSON.stringify(constraints, null, 2)}
MediaDevices: ${navigator.mediaDevices ? 'Available' : 'Not Available'}
getUserMedia: ${hasGetUserMedia ? 'Available' : 'Not Available'}`;
            
            setDiagnosticInfo(info);
        } catch (e) {
            console.warn('Diagnostics error:', e);
        }
    };

    // Get optimized video constraints based on device
    const getVideoConstraints = () => {
        const device = getDeviceInfo();
        
        if (device.isAndroid) {
            // Android needs lower constraints and is more permissive with ideal vs exact
            return {
                facingMode: "user",
                width: { max: 360 },  // More permissive than ideal
                height: { max: 480 },
            };
        } else if (device.isIOS) {
            // iOS specific constraints
            return {
                facingMode: "user",
                width: { max: 720 },
                height: { max: 1280 },
            };
        } else {
            // Desktop - can use higher constraints
            return {
                facingMode: "user",
                width: { ideal: 480 },
                height: { ideal: 640 },
            };
        }
    };

    // Get browser-specific permission recovery steps (Desktop)
    const getDesktopRecoverySteps = (): string[] => {
        const device = getDeviceInfo();
        const steps = [];

        if (device.isChrome) {
            steps.push("Click the 🔒 icon in the address bar");
            steps.push("Find 'Camera' and 'Microphone' settings");
            steps.push("Change from 'Block' to 'Allow'");
            steps.push("Refresh this page and try again");
        } else if (device.isFirefox) {
            steps.push("Click the 🔒 icon in the address bar");
            steps.push("Click 'Clear' next to camera/microphone permissions");
            steps.push("Refresh and grant permissions again when prompted");
        } else if (device.isSafari) {
            steps.push("Go to Safari > Settings > Websites");
            steps.push("Select 'Camera' and 'Microphone' tabs");
            steps.push("Find this website and change to 'Allow'");
            steps.push("Refresh this page and try again");
        } else {
            steps.push("Check your browser's privacy/security settings");
            steps.push("Look for camera and microphone permissions");
            steps.push("Ensure this site is allowed");
            steps.push("Refresh the page");
        }

        return steps;
    };

    // Android-specific permission recovery steps
    const getAndroidRecoverySteps = (): string[] => {
        const device = getDeviceInfo();
        
        // First: Check if it's a browser settings issue
        const browserSteps = [
            "📱 Your browser (Chrome/Firefox) has its own permissions:",
            "1️⃣ Tap ⋮ (three dots) at top right",
            "2️⃣ Tap 'Settings'",
            "3️⃣ Tap 'Site settings'",
            "4️⃣ Tap 'Camera'",
            "5️⃣ Find this website",
            "6️⃣ Change to 'Allow' (or remove from Block list)",
            "7️⃣ Come back here and try again",
        ];
        
        return browserSteps;
    };

    // iOS-specific permission recovery steps
    const getIOSRecoverySteps = (): string[] => {
        return [
            "📱 iOS: Camera permission required in System Settings",
            "1️⃣ Go to Settings app",
            "2️⃣ Scroll down and find your browser (Safari, Chrome, etc.)",
            "3️⃣ Tap on it",
            "4️⃣ Tap 'Camera'",
            "5️⃣ Select 'Allow'",
            "6️⃣ Go back to this page",
            "7️⃣ Try recording again",
        ];
    };

    // Get device-appropriate recovery steps
    const getRecoveryStepsForDevice = (): string[] => {
        const device = getDeviceInfo();
        
        if (device.isAndroid) {
            return getAndroidRecoverySteps();
        } else if (device.isIOS) {
            return getIOSRecoverySteps();
        } else {
            return getDesktopRecoverySteps();
        }
    };

    // Handle mobile-specific errors with detailed messages
    const handleMobileError = (err: unknown) => {
        const device = getDeviceInfo();
        const error = err as { name?: string; message?: string };
        
        console.error("Camera error details:", {
            name: error.name,
            message: error.message,
            isAndroid: device.isAndroid,
            isIOS: device.isIOS,
            permissionPromptShown,
        });

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("❌ Camera API not supported on this device");
            setRecoverySteps(["Your device or browser doesn't support video recording"]);
            return;
        }

        if (device.isAndroid) {
            // Android-specific error handling
            // Run diagnostics to capture more details about why permission was denied
            try {
                // fire and forget diagnostics (updates `diagnosticInfo` state)
                runDiagnostics();
            } catch (e) {
                console.warn('Diagnostics failed', e);
            }
            if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                setCameraError("🔒 Android: Camera/Microphone permission was denied");
                setRecoverySteps([
                    "📋 FIRST - Try these quick fixes:",
                    "1️⃣ Tap Chrome ⋮ → Settings → Privacy → Clear browsing data",
                    "2️⃣ Check Chrome → ⋮ → Settings → Site settings → Camera",
                    "3️⃣ If this website is listed, remove it or set to 'Ask'",
                    "4️⃣ Check Phone Settings → Apps → Chrome → Permissions → Camera → Allow",
                    "5️⃣ Restart Chrome completely (close from recent apps)",
                    "6️⃣ Come back and try again",
                    "",
                    "⏱️ If still not working, wait 30 seconds and try again"
                ]);
            } else if (error.name === "NotFoundError") {
                setCameraError("❌ Android: No camera found on this device");
                setRecoverySteps(["Ensure your device has a working camera", "Try restarting your device"]);
            } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
                setCameraError("⚠️ Android: Camera is in use by another app");
                setRecoverySteps([
                    "Close video apps: Zoom, Teams, Google Meet, etc.",
                    "Close other browser tabs or windows",
                    "Close the native Camera app",
                    "Restart your browser",
                    "Try again"
                ]);
            } else if (error.message?.includes("Permission denied")) {
                setCameraError("🔒 Android: Permission denied. Browser or device settings blocking access.");
                setRecoverySteps([
                    "📋 CLEAR BROWSER CACHE:",
                    "1️⃣ Chrome ⋮ → Settings → Privacy → Clear browsing data",
                    "2️⃣ Make sure 'Cookies and site data' is checked",
                    "3️⃣ Tap 'Clear'",
                    "",
                    "📋 THEN CHECK BROWSER SETTINGS:",
                    "4️⃣ Chrome ⋮ → Settings → Site settings → Camera",
                    "5️⃣ Find this website, set to 'Allow' (or remove if blocked)",
                    "",
                    "📋 THEN CHECK ANDROID PERMISSIONS:",
                    "6️⃣ Phone Settings → Apps → Chrome → Permissions → Camera → Allow",
                    "",
                    "7️⃣ Restart Chrome and try again"
                ]);
            } else {
                // Silent failure or unknown error
                setCameraError("⚠️ Android: Camera access failed. Permission issue or device conflict.");
                setRecoverySteps([
                    "🔧 Troubleshooting steps:",
                    "1️⃣ Clear Chrome cache (Settings → Privacy → Clear browsing data)",
                    "2️⃣ Check Chrome site settings (⋮ → Settings → Site settings → Camera)",
                    "3️⃣ Check Android permissions (Phone Settings → Apps → Chrome → Permissions)",
                    "4️⃣ Close any other apps using camera",
                    "5️⃣ Restart Chrome completely",
                    "6️⃣ Try again",
                    "",
                    "💡 If still failing after these steps, try in a different browser (Firefox)"
                ]);
            }
        } else if (device.isIOS) {
            // iOS-specific error handling
            if (error.name === "PermissionDeniedError" || error.name === "SecurityError") {
                setCameraError("🔒 iOS: Camera/Microphone permission was denied");
                setRecoverySteps(getIOSRecoverySteps());
            } else if (error.name === "NotFoundError") {
                setCameraError("❌ iOS: No camera found on this device");
                setRecoverySteps(["Your device doesn't have a camera"]);
            } else {
                setCameraError("⚠️ iOS: Camera access failed. Please check Settings.");
                setRecoverySteps(getIOSRecoverySteps());
            }
        } else {
            // Desktop browsers
            if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
                setCameraError("🔒 Camera/Microphone permission was denied");
                setRecoverySteps(getDesktopRecoverySteps());
            } else if (error.name === "NotFoundError") {
                setCameraError("❌ No camera or microphone found on this device");
                setRecoverySteps(["Ensure your camera and microphone are connected", "Try plugging in an external USB camera"]);
            } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
                setCameraError("⚠️ Camera/Microphone is being used by another application");
                setRecoverySteps([
                    "Close video conferencing apps (Teams, Zoom, etc.)",
                    "Close other browser tabs or windows using camera",
                    "Check system settings for exclusive access",
                    "Restart your browser and try again",
                ]);
            } else if (error.name === "SecurityError") {
                setCameraError("🔒 Security error: This site is not allowed to access camera/microphone");
                setRecoverySteps(getDesktopRecoverySteps());
            } else {
                setCameraError(`Failed to access camera/microphone: ${error.message || "Unknown error"}`);
                setRecoverySteps(getDesktopRecoverySteps());
            }
        }
    };

    // Android: Detect timeout (silent failure)
    const startCameraWithTimeout = async (constraints: any): Promise<MediaStream> => {
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("ANDROID_SILENT_FAILURE")), 3000)
        );

        try {
            const stream = await Promise.race([
                navigator.mediaDevices.getUserMedia(constraints),
                timeoutPromise,
            ]);
            return stream;
        } catch (err) {
            const error = err as { message?: string };
            if (error.message === "ANDROID_SILENT_FAILURE") {
                const device = getDeviceInfo();
                if (device.isAndroid) {
                    console.warn("Android: Silent failure detected - likely permission prompt didn't show");
                }
            }
            throw err;
        }
    };

    const startCamera = useCallback(async () => {
        try {
            // Check secure context
            if (!isSecureContext()) {
                setCameraError(
                    `⚠️ This website must be accessed via HTTPS for security reasons. Camera and microphone access is blocked on non-secure connections. Please use HTTPS or localhost.`
                );
                setRecoverySteps([
                    "Ensure you're using HTTPS (https://your-domain.com)",
                    "Or use localhost for local development",
                    "HTTP connections cannot access camera/microphone for security",
                ]);
                return;
            }

            setCameraError(null);
            setMicError(null);
            setRecoverySteps([]);

            // Prevent infinite retry attempts
            if (cameraInitAttemptRef.current > 2) {
                setCameraError("Multiple permission requests failed. You can try a different approach or check browser settings.");
                setRecoverySteps([
                    "🔧 Advanced troubleshooting:",
                    "1️⃣ Close Chrome completely (swipe from recent apps)",
                    "2️⃣ Wait 30 seconds",
                    "3️⃣ Reopen Chrome",
                    "4️⃣ Tap the [🔄 Retry] button below",
                    "",
                    "Or try in Firefox/Samsung Internet if available"
                ]);
                return;
            }
            cameraInitAttemptRef.current += 1;

            const device = getDeviceInfo();
            const constraints = {
                video: getVideoConstraints(),
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            };

            // Use timeout for Android (detects silent failures)
            let stream: MediaStream;
            if (device.isAndroid) {
                stream = await startCameraWithTimeout(constraints);
            } else {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            }

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.setAttribute("playsinline", "true");
                await videoRef.current.play();
            }

            // Check audio tracks
            const audioTrack = stream.getAudioTracks()[0];
            if (!audioTrack || !audioTrack.enabled) {
                setMicError("Microphone access denied or not available");
            }

            // Check video tracks
            const videoTrack = stream.getVideoTracks()[0];
            if (!videoTrack || !videoTrack.enabled) {
                setCameraError("Camera access denied or not available");
                setRecoverySteps(getRecoveryStepsForDevice());
                return;
            }

            cameraInitAttemptRef.current = 0;
            setCameraReady(true);
            setPermissionPromptShown(true);
        } catch (err: unknown) {
            handleMobileError(err);
        }
    }, []);

    // Reset attempt counter to allow user to retry after fixing settings
    const resetCameraAttempts = () => {
        cameraInitAttemptRef.current = 0;
        setCameraError(null);
        setMicError(null);
        setRecoverySteps([]);
        setPermissionPromptShown(false);
        // Automatically try camera again
        startCamera();
    };

    // Initialize camera on mount for desktop, but NOT for mobile
    // Mobile requires user gesture (click) to trigger getUserMedia
    useEffect(() => {
        const device = getDeviceInfo();
        
        // For desktop browsers, auto-initialize camera
        // For mobile, wait for user click on "Start Recording"
        if (!device.isMobile && !cameraReady && cameraInitAttemptRef.current === 0) {
            startCamera();
        }

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach((track) => track.stop());
            }
            if (cameraTimeoutRef.current) {
                clearTimeout(cameraTimeoutRef.current);
            }
            if (videoUrl) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, []); // Empty dependency array - only run on mount/unmount

    // Cleanup video URL when it changes
    useEffect(() => {
        return () => {
            if (videoUrl) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [videoUrl]);

    const startRecording = () => {
        // On mobile, we need to initialize camera first (requires user gesture)
        if (!streamRef.current) {
            startCamera();
            return; // Wait for startCamera callback to complete
        }

        if (!streamRef.current) return;

        const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
                ? "video/webm;codecs=vp9,opus"
                : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
                    ? "video/webm;codecs=vp8,opus"
                    : "video/webm",
        });

        chunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: "video/webm" });
            setVideoBlob(blob);
            setVideoUrl(URL.createObjectURL(blob));
            setState("review");
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000);

        setState("recording");
        setDuration(0);
        timerRef.current = setInterval(() => {
            setDuration((prev) => {
                if (prev >= MAX_DURATION) {
                    stopRecording();
                    return prev;
                }
                return prev + 1;
            });
        }, 1000);
    };

    const pauseRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.pause();
            setState("paused");
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    const resumeRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
            mediaRecorderRef.current.resume();
            setState("recording");
            timerRef.current = setInterval(() => {
                setDuration((prev) => {
                    if (prev >= MAX_DURATION) {
                        stopRecording();
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000);
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && (mediaRecorderRef.current.state === "recording" || mediaRecorderRef.current.state === "paused")) {
            mediaRecorderRef.current.stop();
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        }
    };

    const resetRecording = () => {
        if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
        }
        setVideoBlob(null);
        setVideoUrl(null);
        setDuration(0);
        chunksRef.current = [];
        setState("idle");
    };

    const submitRecording = async () => {
        if (!videoBlob || !verificationData) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("video", videoBlob, `${verificationData.verificationId}.webm`);
            formData.append("verificationId", verificationData.verificationId);
            formData.append("policyNumber", verificationData.policyNumber);
            formData.append("mobileNumber", verificationData.mobileNumber);
            formData.append("duration", String(duration));

            const response = await fetch("/api/submit", {
                method: "POST",
                body: formData,
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || "Upload failed");
            }

            toast.success("Verification submitted successfully!", {
                icon: <CheckCircle2 className="w-5 h-5 text-green-500" />,
            });

            sessionStorage.removeItem("verificationData");
            router.push(`/success?vid=${verificationData.verificationId}`);
        } catch (error: unknown) {
            const err = error as { message?: string };
            toast.error(err.message || "Upload failed. Please try again.", {
                icon: <AlertCircle className="w-5 h-5 text-red-500" />,
            });
        } finally {
            setIsUploading(false);
        }
    };

    if (!verificationData) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            {/* Header with policy info */}
            <div className="bg-gray-900/90 backdrop-blur-sm px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between border-b border-gray-800 flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-400 overflow-hidden">
                        <Info className="w-3 h-3 shrink-0" />
                        <span className="truncate">Policy: <span className="text-white font-medium">{verificationData.policyNumber}</span></span>
                    </div>
                    <div className="flex items-center gap-1 sm:gap-2 text-xs text-gray-400 mt-1 overflow-hidden">
                        <Info className="w-3 h-3 shrink-0" />
                        <span className="truncate">Mobile: <span className="text-white font-medium">{verificationData.mobileNumber}</span></span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {(state === "recording" || state === "paused") && (
                        <div className="flex items-center gap-1 bg-black/50 px-2 sm:px-3 py-1 rounded-full">
                            <div className={`w-2 h-2 rounded-full ${state === "recording" ? "bg-red-500 animate-pulse" : "bg-yellow-500"}`} />
                            <span className="text-xs font-mono">{formatDuration(duration)}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                {cameraError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 md:p-8 bg-gray-900 overflow-y-auto">
                        <CameraOff className="w-12 h-12 sm:w-16 sm:h-16 text-red-400 mb-3 sm:mb-4" />
                        <p className="text-red-400 text-center text-xs sm:text-sm mb-4 sm:mb-6 font-medium max-w-md">{cameraError}</p>
                        
                        {recoverySteps.length > 0 && (
                            <div className="mb-4 sm:mb-6 w-full max-w-md bg-gray-800/50 rounded-lg p-3 sm:p-4 border border-gray-700 max-h-48 overflow-y-auto">
                                <p className="text-xs font-semibold text-gray-300 mb-2 sm:mb-3">📋 How to Fix This:</p>
                                <ol className="space-y-1.5 sm:space-y-2">
                                    {recoverySteps.map((step, idx) => (
                                        <li key={idx} className="text-xs text-gray-400 flex gap-2">
                                            <span className="text-gray-500 font-semibold shrink-0">{idx + 1}.</span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        {diagnosticInfo && (
                            <div className="mt-3 sm:mt-4 w-full max-w-md bg-gray-800/60 rounded-lg p-2 sm:p-3 border border-gray-700 text-xs text-gray-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                                <p className="font-semibold text-gray-200 mb-2">🔬 Diagnostics:</p>
                                <pre className="text-xs text-gray-300">{diagnosticInfo}</pre>
                            </div>
                        )}
                        
                        <div className="flex gap-2 flex-wrap justify-center mt-4 sm:mt-6 max-w-md">
                            {cameraInitAttemptRef.current > 2 ? (
                                <>
                                    <Button onClick={resetCameraAttempts} className="flex-1 min-w-fit bg-blue-600 hover:bg-blue-700 text-white text-sm">
                                        🔄 Reset & Retry
                                    </Button>
                                    <Button onClick={() => router.push("/")} variant="ghost" className="flex-1 min-w-fit text-gray-400 text-sm">
                                        ← Go Back
                                    </Button>
                                </>
                            ) : (
                                <>
                                    <Button onClick={startCamera} variant="outline" className="flex-1 min-w-fit text-white border-gray-600 text-sm">
                                        🔄 Retry
                                    </Button>
                                    <Button onClick={() => router.push("/")} variant="ghost" className="flex-1 min-w-fit text-gray-400 text-sm">
                                        ← Go Back
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                ) : micError ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 md:p-8 bg-gray-900 overflow-y-auto">
                        <MicOff className="w-12 h-12 sm:w-16 sm:h-16 text-yellow-400 mb-3 sm:mb-4" />
                        <p className="text-yellow-400 text-center text-xs sm:text-sm mb-3 sm:mb-4 font-medium">{micError}</p>
                        <p className="text-gray-500 text-xs text-center mb-4 sm:mb-6 max-w-md">
                            Recording will continue without audio. You can still submit the video.
                        </p>
                        {recoverySteps.length > 0 && (
                            <div className="mb-4 sm:mb-6 w-full max-w-md bg-gray-800/50 rounded-lg p-3 sm:p-4 border border-gray-700 max-h-48 overflow-y-auto">
                                <p className="text-xs font-semibold text-gray-300 mb-2 sm:mb-3">📋 To Enable Microphone:</p>
                                <ol className="space-y-1.5 sm:space-y-2">
                                    {recoverySteps.map((step, idx) => (
                                        <li key={idx} className="text-xs text-gray-400 flex gap-2">
                                            <span className="text-gray-500 font-semibold shrink-0">{idx + 1}.</span>
                                            <span>{step}</span>
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        <div className="flex gap-2 flex-wrap justify-center max-w-md">
                            <Button onClick={() => { startCamera(); setMicError(null); }} variant="outline" className="flex-1 min-w-fit text-white border-gray-600 text-sm">
                                🔄 Retry Microphone
                            </Button>
                            <Button onClick={() => setMicError(null)} variant="outline" className="flex-1 min-w-fit text-white border-gray-600 text-sm">
                                Continue Anyway
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex-1 relative bg-black">
                            <video
                                ref={videoRef}
                                className="absolute inset-0 w-full h-full object-cover"
                                muted
                                playsInline
                            />

                            {!cameraReady && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                                </div>
                            )}

                            {state === "recording" && (
                                <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full">
                                    <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" />
                                    <span className="text-xs text-white font-medium">REC</span>
                                </div>
                            )}

                            {state === "paused" && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                    <div className="text-center">
                                        <Pause className="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                                        <p className="text-yellow-400 text-sm font-medium">Recording Paused</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {state === "review" && videoUrl && (
                            <div className="flex-1 relative bg-black flex items-center justify-center">
                                <video
                                    src={videoUrl}
                                    className="max-w-full max-h-full object-contain"
                                    controls
                                    playsInline
                                />
                            </div>
                        )}
                    </>
                )}

                <div className="bg-gray-900/95 backdrop-blur-sm px-3 sm:px-4 py-2 sm:py-3 space-y-2 sm:space-y-3 border-t border-gray-800 overflow-y-auto max-h-40 sm:max-h-48">
                    {(state === "recording" || state === "paused") && (
                        <Teleprompter isRecording={state === "recording"} isPaused={state === "paused"} />
                    )}

                    {state === "idle" && !cameraError && !micError && (
                        <>
                            <Button
                                onClick={startRecording}
                                className="w-full h-11 sm:h-12 text-base font-semibold bg-red-600 hover:bg-red-700 text-white rounded-xl"
                                disabled={!cameraReady && !getDeviceInfo().isMobile}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <div className="w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-white" />
                                    <span className="text-sm sm:text-base">{getDeviceInfo().isMobile ? "📱 Start Recording" : "Start Recording"}</span>
                                </div>
                            </Button>
                            {getDeviceInfo().isMobile && !cameraReady && (
                                <p className="text-xs text-gray-400 text-center">
                                    💡 When you tap above, your phone will ask for camera permission. Tap "Allow" to proceed.
                                </p>
                            )}
                        </>
                    )}

                    {state === "idle" && !cameraError && !micError && !cameraReady && !getDeviceInfo().isMobile && (
                        <div className="flex items-center justify-center gap-2 text-gray-400 text-xs h-11 sm:h-12">
                            <div className="animate-spin h-4 w-4 border-2 border-gray-600 border-t-blue-500 rounded-full" />
                            Initializing camera...
                        </div>
                    )}

                    {state === "recording" && (
                        <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <Button
                                onClick={pauseRecording}
                                variant="outline"
                                className="flex-1 h-11 sm:h-12 text-xs sm:text-sm border-gray-600 text-white hover:bg-gray-800 rounded-xl"
                            >
                                <Pause className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                                <span className="hidden xs:inline">Pause</span>
                            </Button>
                            <Button
                                onClick={stopRecording}
                                className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-red-600 hover:bg-red-700 text-white"
                            >
                                <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                            </Button>
                        </div>
                    )}

                    {state === "paused" && (
                        <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <Button
                                onClick={resumeRecording}
                                variant="outline"
                                className="flex-1 h-11 sm:h-12 text-xs sm:text-sm border-gray-600 text-white hover:bg-gray-800 rounded-xl"
                            >
                                <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                                <span className="hidden xs:inline">Resume</span>
                            </Button>
                            <Button
                                onClick={stopRecording}
                                className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-red-600 hover:bg-red-700 text-white"
                            >
                                <Square className="w-4 h-4 sm:w-5 sm:h-5" />
                            </Button>
                        </div>
                    )}

                    {state === "review" && (
                        <div className="flex items-center justify-center gap-2 sm:gap-3">
                            <Button
                                onClick={resetRecording}
                                variant="outline"
                                className="flex-1 h-11 sm:h-12 text-xs sm:text-sm border-gray-600 text-white hover:bg-gray-800 rounded-xl"
                            >
                                <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 mr-1.5 sm:mr-2" />
                                <span className="hidden xs:inline">Re-record</span>
                            </Button>
                            <Button
                                onClick={submitRecording}
                                disabled={isUploading}
                                className="flex-1 h-11 sm:h-12 text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl"
                            >
                                {isUploading ? (
                                    <span className="flex items-center justify-center gap-1.5 sm:gap-2">
                                        <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        <span className="hidden xs:inline">Uploading...</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-1.5 sm:gap-2">
                                        <Upload className="w-4 h-4 sm:w-5 sm:h-5" />
                                        <span className="hidden xs:inline">Submit</span>
                                    </span>
                                )}
                            </Button>
                        </div>
                    )}

                    {state === "recording" && duration >= MAX_DURATION - 30 && (
                        <div className="flex items-center justify-center gap-2 text-yellow-400 text-xs">
                            <Clock className="w-3 h-3" />
                            Recording will automatically stop at {formatDuration(MAX_DURATION)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function RecordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        }>
            <RecordContent />
        </Suspense>
    );
}