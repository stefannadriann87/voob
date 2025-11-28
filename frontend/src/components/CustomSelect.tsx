"use client";

import * as Select from "@radix-ui/react-select";
import { useState } from "react";

interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  error?: boolean;
  size?: "sm" | "md" | "lg";
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Selectează...",
  className = "",
  disabled = false,
  required = false,
  error = false,
  size = "md",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);

  const sizeClasses = {
    sm: "px-2 py-1.5 text-xs min-h-[36px]",
    md: "px-3 py-2 text-xs min-h-[44px]",
    lg: "px-4 py-3 text-sm min-h-[52px]",
  };

  // Handle empty string value - Radix UI doesn't allow empty string in Select.Item
  // So we use undefined to show placeholder when value is empty
  const selectValue = value === "" ? undefined : value;
  
  const handleValueChange = (newValue: string | undefined) => {
    onChange(newValue || "");
  };

  return (
    <Select.Root
      value={selectValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      required={required}
      open={open}
      onOpenChange={setOpen}
    >
      <Select.Trigger
        className={`
          flex items-center justify-between gap-2
          rounded-lg border
          bg-[#0B0E17]/60
          text-white
          outline-none transition-all duration-200
          touch-manipulation
          ${sizeClasses[size]}
          ${error ? "border-red-500/50" : "border-white/10"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
          ${!disabled && !error && "hover:bg-[#0B0E17]/80 focus:border-[#6366F1] focus:ring-2 focus:ring-[#6366F1]/20"}
          ${className}
        `}
        aria-invalid={error}
        aria-required={required}
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon className="text-white/60 flex-shrink-0 transition-transform duration-200 data-[state=open]:rotate-180">
          <i className="fas fa-chevron-down text-xs" />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          className={`
            overflow-hidden rounded-lg border border-white/10
            bg-[#0B0E17] shadow-xl shadow-black/40
            z-[100] min-w-[var(--radix-select-trigger-width)]
            max-h-[300px]
            data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
            data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95
            duration-200
          `}
          position="popper"
          sideOffset={4}
        >
          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-[#0B0E17] text-white/60">
            <i className="fas fa-chevron-up text-xs" />
          </Select.ScrollUpButton>

          <Select.Viewport className="p-1">
            {options
              .filter((option) => option.value !== "") // Filter out empty string values
              .map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={`
                    relative flex items-center px-3 py-2
                    text-xs text-white
                    rounded-md cursor-pointer
                    outline-none select-none
                    transition-colors duration-150
                    ${option.disabled 
                      ? "opacity-50 cursor-not-allowed" 
                      : "hover:bg-[#6366F1]/10 focus:bg-[#6366F1]/10 data-[highlighted]:bg-[#6366F1]/10"
                    }
                    ${value === option.value ? "bg-[#6366F1]/10 text-[#6366F1]" : ""}
                  `}
                >
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator className="absolute right-3 flex items-center">
                    <i className="fas fa-check text-xs text-[#6366F1]" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
          </Select.Viewport>

          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-[#0B0E17] text-white/60">
            <i className="fas fa-chevron-down text-xs" />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

