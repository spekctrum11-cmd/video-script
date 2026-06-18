"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface TeleprompterProps {
    isRecording: boolean;
    isPaused: boolean;
    speed?: number;
    onComplete?: () => void;
}

const DEFAULT_SCRIPT = [
    "My name is [Customer Name].",
    "",
    "I confirm that I have understood the policy benefits, terms, and conditions.",
    "",
    "I am purchasing this policy voluntarily.",
    "",
    "I confirm that all information provided by me is accurate and correct.",
];

export default function Teleprompter({ isRecording, isPaused, speed = 1, onComplete }: TeleprompterProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    const animationRef = useRef<number | null>(null);
    const lastTimeRef = useRef<number>(0);
    const pausedPositionRef = useRef<number>(0);

    const SCROLL_SPEED = 0.3 * speed; // pixels per frame

    const animate = useCallback((timestamp: number) => {
        if (!lastTimeRef.current) lastTimeRef.current = timestamp;
        const delta = timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;

        setScrollPosition((prev) => {
            const newPos = prev + SCROLL_SPEED * (delta / 16.67);
            return newPos;
        });

        animationRef.current = requestAnimationFrame(animate);
    }, [SCROLL_SPEED]);

    useEffect(() => {
        if (isRecording && !isPaused) {
            lastTimeRef.current = 0;
            animationRef.current = requestAnimationFrame(animate);
        } else {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            if (isPaused) {
                pausedPositionRef.current = scrollPosition;
            }
        }

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isRecording, isPaused, animate]);

    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = scrollPosition;
        }
    }, [scrollPosition]);

    return (
        <div className="relative w-full">
            {/* Gradient overlays for better readability */}
            <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black/60 to-transparent z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/60 to-transparent z-10 pointer-events-none" />

            <div
                ref={containerRef}
                className="w-full h-28 sm:h-36 overflow-hidden rounded-xl bg-black/50 backdrop-blur-sm border border-white/10 p-2 sm:p-3 scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
                <div className="space-y-1.5 sm:space-y-2">
                    {DEFAULT_SCRIPT.map((line, index) => (
                        <p
                            key={index}
                            className={`text-xs sm:text-sm leading-relaxed text-center transition-opacity duration-300 ${line === "" ? "h-2 sm:h-3" : line.startsWith("I") || line.startsWith("My")
                                ? "text-white font-medium"
                                : "text-white/70"
                                }`}
                        >
                            {line || "\u00A0"}
                        </p>
                    ))}
                </div>
            </div>
        </div>
    );
}