import mongoose from 'mongoose';

const VideoVerificationSchema = new mongoose.Schema({
    verificationId: {
        type: String,
        required: true,
        unique: true,
    },
    policyNumber: {
        type: String,
        required: true,
    },
    mobileNumber: {
        type: String,
        required: true,
    },
    videoUrl: {
        type: String,
        required: true,
    },
    cloudinaryPublicId: {
        type: String,
        required: true,
    },
    videoDuration: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['submitted', 'verified', 'rejected'],
        default: 'submitted',
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

export default mongoose.models.VideoVerification || mongoose.model('VideoVerification', VideoVerificationSchema);