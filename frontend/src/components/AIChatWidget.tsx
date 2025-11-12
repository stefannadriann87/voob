"use client";

import { FormEvent, useState } from "react";
import { X, Send, Bot } from "lucide-react";
import useBookings from "../hooks/useBookings";

interface AIChatWidgetProps {
  initialOpen?: boolean;
}

export default function AIChatWidget({ initialOpen = false }: AIChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<{ from: "user" | "ai"; text: string }[]>([
    {
      from: "ai",
      text: "Salut! Sunt asistentul LARSTEF. Spune-mi ce rezervare dorești iar eu o pregătesc pentru tine.",
    },
  ]);
  const [input, setInput] = useState("");
  const { createBookingFromAI } = useBookings();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { from: "user", text: userMessage }]);
    setInput("");

    const aiMessage = await createBookingFromAI(userMessage);
    setMessages((prev) => [...prev, { from: "ai", text: aiMessage }]);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] sm:bottom-6 sm:right-6">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-full border-2 border-[#6366F1] bg-[#6366F1] px-4 py-2.5 text-sm font-semibold text-white shadow-2xl shadow-[#6366F1]/50 transition-all hover:bg-[#7C3AED] hover:border-[#7C3AED] hover:scale-105 active:scale-95 sm:gap-3 sm:px-5 sm:py-3"
          aria-label="Deschide chat AI"
        >
          <Bot size={18} className="shrink-0 sm:w-5 sm:h-5" />
          <span className="whitespace-nowrap">Chat AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] sm:bottom-6 sm:right-6">
      <div className="flex w-[calc(100vw-2rem)] max-w-80 flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0B0E17]/95 backdrop-blur-sm text-white shadow-2xl shadow-black/50 sm:w-80">
        <div className="flex items-center justify-between bg-[#6366F1]/30 px-5 py-3">
          <span className="text-sm font-semibold">LARSTEF AI Assistant</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-white/70 transition hover:text-white"
            aria-label="Închide chat"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex h-72 flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
          {messages.map((message, index) => (
            <div
              key={`${message.from}-${index}`}
              className={`flex ${message.from === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                  message.from === "user"
                    ? "bg-[#6366F1] text-white"
                    : "bg-white/10 text-white/90"
                }`}
              >
                {message.text}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ex: Programează-mă vineri la ora 16"
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none transition focus:border-[#6366F1]"
          />
          <button
            type="submit"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6366F1] text-white transition hover:bg-[#7C3AED]"
            aria-label="Trimite mesaj"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}

