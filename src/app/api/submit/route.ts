import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VideoVerification from "@/lib/models/VideoVerification";
import { uploadVideo } from "@/lib/cloudinary";
import { generateVerificationId, validateMobileNumber, formatMobileNumber, getFullMobileNumber } from "@/lib/utils";

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

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

        // Validate file size (max 100MB)
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

        // Upload to Cloudinary
        let cloudinaryResult;
        try {
            cloudinaryResult = await uploadVideo(videoBuffer, vid);
        } catch {
            return NextResponse.json(
                { error: "Failed to upload video to storage. Please try again." },
                { status: 500 }
            );
        }

        // Connect to MongoDB and save
        await connectDB();

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