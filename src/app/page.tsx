"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { validateMobileNumber, generateVerificationId, formatMobileNumber, getFullMobileNumber } from "@/lib/utils";
import { Shield, Phone, FileText, ArrowRight } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const [policyNumber, setPolicyNumber] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [errors, setErrors] = useState<{ policy?: string; mobile?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = (): boolean => {
    const newErrors: { policy?: string; mobile?: string } = {};

    if (!policyNumber.trim()) {
      newErrors.policy = "Policy Number is required";
    }

    if (!mobileNumber.trim()) {
      newErrors.mobile = "Mobile Number is required";
    } else if (!validateMobileNumber(mobileNumber.trim())) {
      newErrors.mobile = "Please enter a valid 10-digit mobile number (e.g., 9876543210)";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    const verificationId = generateVerificationId();
    const fullMobile = getFullMobileNumber(mobileNumber);
    const cleanMobile = formatMobileNumber(mobileNumber);

    // Store in sessionStorage for the recording flow
    sessionStorage.setItem("verificationData", JSON.stringify({
      policyNumber: policyNumber.trim(),
      mobileNumber: fullMobile, // Store as +91XXXXXXXXXX
      mobileDisplay: cleanMobile, // Store clean 10 digits for display
      verificationId,
    }));

    router.push(`/record?vid=${verificationId}`);
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Remove all non-digit characters
    let digits = raw.replace(/\D/g, "");

    // If user types +91 or 91 prefix, strip it
    if (digits.startsWith("91") && digits.length > 10) {
      digits = digits.slice(2);
    }

    // Allow max 10 digits
    digits = digits.slice(0, 10);

    setMobileNumber(digits);
    if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: undefined }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-blue-50 to-white safe-bottom">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 sm:py-8 w-full">
        <div className="w-full max-w-sm">
          {/* Logo & Header */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-100 mb-3 sm:mb-4">
              <Shield className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Insurance Verification</h1>
            <p className="text-xs sm:text-sm text-gray-500 mt-1.5 sm:mt-2 px-2">
              Please provide your policy details to begin the verification process
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
            <div>
              <label htmlFor="policyNumber" className="block text-sm sm:text-base font-medium text-gray-700 mb-1.5">
                <FileText className="w-4 h-4 inline mr-1.5" />
                Policy Number
              </label>
              <input
                id="policyNumber"
                type="text"
                value={policyNumber}
                onChange={(e) => {
                  setPolicyNumber(e.target.value);
                  if (errors.policy) setErrors((prev) => ({ ...prev, policy: undefined }));
                }}
                placeholder="Enter your policy number"
                className={`w-full px-4 py-3 sm:py-3.5 rounded-lg border text-base transition-all ${errors.policy ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
                  } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                autoComplete="off"
              />
              {errors.policy && <p className="mt-1.5 text-xs sm:text-sm text-red-600">{errors.policy}</p>}
            </div>

            <div>
              <label htmlFor="mobileNumber" className="block text-sm sm:text-base font-medium text-gray-700 mb-1.5">
                <Phone className="w-4 h-4 inline mr-1.5" />
                Mobile Number
              </label>
              <div className="relative">
                <input
                  id="mobileNumber"
                  type="tel"
                  value={mobileNumber}
                  onChange={handleMobileChange}
                  placeholder="+91 9876543210"
                  className={`w-full px-4 py-3 sm:py-3.5 rounded-lg border text-base transition-all ${errors.mobile ? "border-red-500 ring-2 ring-red-200" : "border-gray-300"
                    } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
                  inputMode="numeric"
                  autoComplete="tel"
                />
              </div>
              {errors.mobile && <p className="mt-1.5 text-xs sm:text-sm text-red-600">{errors.mobile}</p>}
              <p className="mt-1 text-xs text-gray-400">Enter 10-digit number without country code</p>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 sm:h-13 text-base font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Processing...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Continue to Video Verification
                  <ArrowRight className="w-5 h-5" />
                </span>
              )}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-xs text-gray-400 mt-6 sm:mt-8 px-2">
            Your information is secure and encrypted
          </p>
        </div>
      </div>
    </div>
  );
}