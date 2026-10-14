import * as React from "react"
import { cn } from "@/lib/utils"

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
    value: number
    min: number
    max: number
    step?: number
    onValueChange: (value: number) => void
}

/**
 * Plain native <input type="range"> rather than a Radix-based component —
 * this project has no @radix-ui/react-slider dependency, and one slider
 * doesn't warrant adding it. `accent-color` (via Tailwind's `accent-*`)
 * themes the native thumb/track consistently with the rest of the app in
 * every evergreen browser without any custom track/thumb markup.
 */
export function Slider({ value, min, max, step = 0.01, onValueChange, className, ...props }: SliderProps) {
    return (
        <input
            type="range"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onValueChange(Number(e.target.value))}
            className={cn("accent-primary h-1.5 w-full cursor-pointer", className)}
            {...props}
        />
    )
}
