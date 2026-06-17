import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadVideo(videoBuffer: Buffer, publicId: string): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                resource_type: 'video',
                public_id: publicId,
                folder: 'video-verifications',
                eager: [{ streaming_profile: 'auto', format: 'm3u8' }],
                eager_async: true,
            },
            (error, result) => {
                if (error) {
                    reject(error);
                } else if (result) {
                    resolve({
                        url: result.secure_url,
                        publicId: result.public_id,
                    });
                } else {
                    reject(new Error('Upload failed: No result returned'));
                }
            }
        );

        uploadStream.end(videoBuffer);
    });
}

export async function deleteVideo(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
}

export default cloudinary;