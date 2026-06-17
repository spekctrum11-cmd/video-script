import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import VideoVerification from "@/lib/models/VideoVerification";

export async function GET(request: NextRequest) {
    try {
        await connectDB();

        const searchParams = request.nextUrl.searchParams;
        const search = searchParams.get("search")?.trim();
        const page = parseInt(searchParams.get("page") || "1", 10);
        const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
        const skip = (page - 1) * limit;

        // Build query
        let query = {};
        if (search) {
            query = {
                $or: [
                    { policyNumber: { $regex: search, $options: "i" } },
                    { mobileNumber: { $regex: search, $options: "i" } },
                    { verificationId: { $regex: search, $options: "i" } },
                ],
            };
        }

        const [verifications, total] = await Promise.all([
            VideoVerification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            VideoVerification.countDocuments(query),
        ]);

        return NextResponse.json({
            verifications,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error("Admin fetch error:", error);
        return NextResponse.json(
            { error: "Failed to fetch verifications" },
            { status: 500 }
        );
    }
}