"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Shield, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

function SuccessContent() {
    const searchParams = useSearchParams();
    const verificationId = searchParams.get("vid") || "";

    const copyToClipboard = async () => {
        try {
            await navigator.clipboard.writeText(verificationId);
            toast.success("Verification ID copied to clipboard");
        } catch {
            toast.error("Failed to copy to clipboard");
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-b from-green-50 to-white safe-bottom">
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8">
                <div className="w-full max-w-sm text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-green-100 mb-4 sm:mb-6">
                        <CheckCircle2 className="w-8 h-8 sm:w-10 sm:h-10 text-green-600" />
                    </div>

                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                        Verification Submitted!
                    </h1>
                    <p className="text-xs sm:text-sm text-gray-500 mb-6 sm:mb-8">
                        Your video verification has been submitted successfully. Our team will review it shortly.
                    </p>

                    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-6 sm:mb-8 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-blue-500" />
                            <span className="text-xs text-gray-500 font-medium">Verification ID</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-lg px-2 sm:px-3 py-2">
                            <code className="text-xs sm:text-sm font-mono text-gray-800 truncate">{verificationId}</code>
                            <button
                                onClick={copyToClipboard}
                                className="p-1.5 hover:bg-gray-200 rounded-md transition-colors shrink-0"
                                title="Copy to clipboard"
                            >
                                <Copy className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                    </div>

                    <div className="text-left bg-white rounded-xl border border-gray-200 p-3 sm:p-4 mb-6 sm:mb-8 shadow-sm">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">What happens next?</h3>
                        <ul className="space-y-2">
                            <li className="flex items-start gap-2 text-xs sm:text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                <span>Our team will review your verification video</span>
                            </li>
                            <li className="flex items-start gap-2 text-xs sm:text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                <span>You will receive a confirmation on your registered mobile number</span>
                            </li>
                            <li className="flex items-start gap-2 text-xs sm:text-sm text-gray-600">
                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                <span>Your policy verification status will be updated within 24 hours</span>
                            </li>
                        </ul>
                    </div>

                    <div className="space-y-2 sm:space-y-3">
                        <Link href="/">
                            <Button className="w-full h-11 sm:h-12 text-sm sm:text-base bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
                                Submit Another Verification
                            </Button>
                        </Link>
                        <Link href="/admin">
                            <Button variant="outline" className="w-full h-11 sm:h-12 text-sm sm:text-base rounded-lg">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Admin Dashboard
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>

            <p className="text-center text-xs text-gray-400 pb-4 sm:pb-6">
                Please keep your Verification ID for future reference
            </p>
        </div>
    );
}

export default function SuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}