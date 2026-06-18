import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VideoVerification from "@/lib/models/VideoVerification";
import { uploadVideo } from "@/lib/cloudinary";
import { compressVideo } from "@/lib/compressVideo";
import { generateVerificationId, validateMobileNumber, formatMobileNumber, getFullMobileNumber } from "@/lib/utils";

export const maxDuration = 120; // 2 minutes for video processing + upload

export async function POST(request: NextRequest) {
    try {
        let formData: FormData;
        try {
            formData = await request.formData();
        } catch (parseError: unknown) {
            const msg = parseError instanceof Error ? parseError.message : String(parseError);
            console.error("FormData parse error:", msg);
            return NextResponse.json(
                { error: "Failed to parse upload data. The file may be too large or the request was interrupted. Please try a shorter video." },
                { status: 413 }
            );
        }

        const videoFile = formData.get("video") as File | null;
        const verificationId = formData.get("verificationId") as string | null;
        const policyNumber = formData.get("policyNumber") as string | null;
        const mobileNumber = formData.get("mobileNumber") as string | null;
        const duration = formData.get("duration") as string | null;

        // Server-side validation
        if (!policyNumber || !policyNumber.trim()) {
            return NextResponse.json(
                { error: "Policy Number is required" },
                { status: 400 }
            );
        }

        if (!mobileNumber || !validateMobileNumber(mobileNumber.trim())) {
            return NextResponse.json(
                { error: "Valid Mobile Number is required" },
                { status: 400 }
            );
        }

        // Format the mobile number consistently
        const formattedMobile = getFullMobileNumber(mobileNumber);

        if (!videoFile) {
            return NextResponse.json(
                { error: "Video file is required" },
                { status: 400 }
            );
        }

        // Validate file type
        if (!videoFile.type.startsWith("video/")) {
            return NextResponse.json(
                { error: "Only video files are allowed" },
                { status: 400 }
            );
        }

        // Validate file size (max 100MB before compression)
        const maxSize = 100 * 1024 * 1024;
        if (videoFile.size > maxSize) {
            return NextResponse.json(
                { error: "Video file size exceeds 100MB limit" },
                { status: 400 }
            );
        }

        // Generate unique verification ID if not provided
        const vid = verificationId || generateVerificationId();

        // Convert File to Buffer
        const arrayBuffer = await videoFile.arrayBuffer();
        const videoBuffer = Buffer.from(arrayBuffer);

        // Compress video (progressive fallback: aggressive → medium → light)
        // compressVideo internally tries 3 levels with per-level timeouts
        // and will always produce a compressed output smaller than input
        let compressedBuffer: Buffer;
        try {
            compressedBuffer = await compressVideo(videoBuffer);
        } catch (error) {
            console.error("Video compression error:", error);
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("SPAWN_ERROR") || msg.includes("ENOENT") || msg.includes("ffmpeg binary not found")) {
                return NextResponse.json(
                    { error: "Video processing tool is not available on the server. Please contact support." },
                    { status: 500 }
                );
            }
            // Pass the diagnostic info to help debugging
            const diag = error instanceof Error ? error.message.slice(0, 200) : "Unknown error";
            return NextResponse.json(
                {
                    error: "Failed to compress video.",
                    detail: diag,
                    suggestion: "Try a shorter recording or a different browser."
                },
                { status: 500 }
            );
        }

        // Upload video to Cloudinary
        let cloudinaryResult;
        try {
            cloudinaryResult = await uploadVideo(compressedBuffer, vid);
        } catch (error: unknown) {
            console.error("Cloudinary upload error:", error);
            const msg = error instanceof Error ? error.message : String(error);
            if (msg.includes("Authentication") || msg.includes("api_key") || msg.includes("api_secret")) {
                return NextResponse.json(
                    { error: "Storage service configuration error. Please contact support." },
                    { status: 500 }
                );
            }
            return NextResponse.json(
                { error: "Failed to upload video to storage. Please try again." },
                { status: 500 }
            );
        }

        // Connect to MongoDB and save
        try {
            await connectDB();
        } catch (error) {
            console.error("Database connection error:", error);
            return NextResponse.json(
                { error: "Database connection failed. Please try again later." },
                { status: 500 }
            );
        }

        try {
            const verification = new VideoVerification({
                verificationId: vid,
                policyNumber: policyNumber.trim(),
                mobileNumber: formattedMobile,
                videoUrl: cloudinaryResult.url,
                cloudinaryPublicId: cloudinaryResult.publicId,
                videoDuration: parseInt(duration || "0", 10),
                status: "submitted",
            });

            await verification.save();
        } catch (error) {
            console.error("Database save error:", error);
            return NextResponse.json(
                { error: "Failed to save verification record. Please try again." },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            verificationId: vid,
            message: "Verification submitted successfully",
        });
    } catch (error) {
        console.error("Submission error:", error);
        return NextResponse.json(
            { error: "Internal server error. Please try again later." },
            { status: 500 }
        );
    }
}