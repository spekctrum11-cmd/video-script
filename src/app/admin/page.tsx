"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import { Search, Download, Play, X, Shield, ExternalLink, Calendar, Clock, Phone, FileText } from "lucide-react";

interface Verification {
    _id: string;
    verificationId: string;
    policyNumber: string;
    mobileNumber: string;
    videoUrl: string;
    videoDuration: number;
    status: string;
    createdAt: string;
}

interface Pagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export default function AdminPage() {
    const [verifications, setVerifications] = useState<Verification[]>([]);
    const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

    const fetchVerifications = useCallback(async (page = 1, searchTerm = "") => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set("page", String(page));
            params.set("limit", "20");
            if (searchTerm) params.set("search", searchTerm);

            const response = await fetch(`/api/admin/verifications?${params}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error);

            setVerifications(data.verifications);
            setPagination(data.pagination);
        } catch (error) {
            console.error("Failed to fetch verifications:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchVerifications(1, searchQuery);
    }, [fetchVerifications, searchQuery]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(search);
        setPagination((prev) => ({ ...prev, page: 1 }));
    };

    const downloadVideo = async (url: string, filename: string) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `${filename}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
        } catch {
            // Fallback: open in new tab
            window.open(url, "_blank");
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "submitted":
                return "bg-blue-100 text-blue-700";
            case "verified":
                return "bg-green-100 text-green-700";
            case "rejected":
                return "bg-red-100 text-red-700";
            default:
                return "bg-gray-100 text-gray-700";
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 safe-bottom">
            {/* Admin Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 sm:mb-4">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-blue-600 flex items-center justify-center shrink-0">
                                <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-base sm:text-lg font-bold text-gray-900">Admin Dashboard</h1>
                                <p className="text-xs text-gray-500">Video Verification Records</p>
                            </div>
                        </div>
                        <div className="text-xs text-gray-400">
                            Total: <span className="font-medium text-gray-600">{pagination.total}</span> records
                        </div>
                    </div>

                    {/* Search Bar */}
                    <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 relative min-w-0">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 shrink-0" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-9 pr-9 py-2 sm:py-2.5 text-xs sm:text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearch("");
                                        setSearchQuery("");
                                    }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 shrink-0"
                                >
                                    <X className="w-4 h-4 text-gray-400" />
                                </button>
                            )}
                        </div>
                        <Button type="submit" size="sm" className="h-9 sm:h-10 px-3 sm:px-4 text-xs sm:text-sm">
                            Search
                        </Button>
                    </form>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
                    </div>
                ) : verifications.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 mb-4">
                            <Shield className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900 mb-1">No verifications found</h3>
                        <p className="text-sm text-gray-500">
                            {searchQuery ? "Try a different search term" : "No video verifications have been submitted yet"}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Mobile Cards View */}
                        <div className="space-y-2 sm:space-y-3 md:hidden">
                            {verifications.map((verification) => (
                                <div key={verification._id} className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 shadow-sm">
                                    <div className="flex items-start justify-between mb-3 gap-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs text-gray-500 mb-0.5">Verification ID</p>
                                            <code className="text-xs font-mono text-gray-800 break-all">{verification.verificationId}</code>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize shrink-0 ${getStatusColor(verification.status)}`}>
                                            {verification.status}
                                        </span>
                                    </div>
                                    <div className="space-y-1.5 mb-3">
                                        <div className="flex items-center gap-2 text-xs sm:text-sm overflow-hidden">
                                            <FileText className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-gray-600 truncate">{verification.policyNumber}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs sm:text-sm overflow-hidden">
                                            <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-gray-600 truncate">{verification.mobileNumber}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs sm:text-sm overflow-hidden">
                                            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-gray-600 truncate">{formatDate(verification.createdAt)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs sm:text-sm">
                                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                            <span className="text-gray-600">{formatDuration(verification.videoDuration)}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 text-xs h-9"
                                            onClick={() => setSelectedVideo(verification.videoUrl)}
                                        >
                                            <Play className="w-3.5 h-3.5 mr-1" />
                                            <span className="hidden xs:inline">View</span>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="flex-1 text-xs h-9"
                                            onClick={() => downloadVideo(verification.videoUrl, verification.verificationId)}
                                        >
                                            <Download className="w-3.5 h-3.5 mr-1" />
                                            <span className="hidden xs:inline">Download</span>
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-200">
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Verification ID</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Policy Number</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Mobile Number</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Recording Date</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Duration</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                                            <th className="text-left px-4 py-3 font-medium text-gray-500">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {verifications.map((verification) => (
                                            <tr key={verification._id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3">
                                                    <code className="text-xs font-mono text-gray-800">{verification.verificationId}</code>
                                                </td>
                                                <td className="px-4 py-3 text-gray-700">{verification.policyNumber}</td>
                                                <td className="px-4 py-3 text-gray-700">{verification.mobileNumber}</td>
                                                <td className="px-4 py-3 text-gray-600 text-xs">{formatDate(verification.createdAt)}</td>
                                                <td className="px-4 py-3 text-gray-600">{formatDuration(verification.videoDuration)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(verification.status)}`}>
                                                        {verification.status}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setSelectedVideo(verification.videoUrl)}
                                                            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                                                            title="View Video"
                                                        >
                                                            <Play className="w-4 h-4 text-blue-600" />
                                                        </button>
                                                        <button
                                                            onClick={() => downloadVideo(verification.videoUrl, verification.verificationId)}
                                                            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                                                            title="Download Video"
                                                        >
                                                            <Download className="w-4 h-4 text-gray-500" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Pagination */}
                        {pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-2 mt-4">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => fetchVerifications(pagination.page - 1, searchQuery)}
                                >
                                    Previous
                                </Button>
                                <span className="text-sm text-gray-500">
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => fetchVerifications(pagination.page + 1, searchQuery)}
                                >
                                    Next
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Video Player Modal */}
            {selectedVideo && (
                <div
                    className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-2 sm:p-4"
                    onClick={() => setSelectedVideo(null)}
                >
                    <div
                        className="max-w-2xl w-full max-h-[90vh] sm:max-h-screen flex flex-col bg-black rounded-lg sm:rounded-xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 shrink-0">
                            <h3 className="text-xs sm:text-sm text-white font-medium">Video Preview</h3>
                            <button
                                onClick={() => setSelectedVideo(null)}
                                className="p-1 hover:bg-gray-800 rounded-md transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto bg-black">
                            <video
                                src={selectedVideo}
                                className="w-full h-full object-contain"
                                controls
                                autoPlay
                                playsInline
                            />
                        </div>
                        <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 shrink-0">
                            <a
                                href={selectedVideo}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-xs sm:text-sm text-blue-400 hover:text-blue-300 w-fit"
                            >
                                <ExternalLink className="w-4 h-4" />
                                Open in new tab
                            </a>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}