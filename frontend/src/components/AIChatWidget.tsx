"use client";

import { FormEvent, useState, useEffect } from "react";
import { X, Send, Bot } from "lucide-react";
import useApi from "../hooks/useApi";
import { usePathname } from "next/navigation";

interface AIChatWidgetProps {
  initialOpen?: boolean;
  onBookingCreated?: () => void;
}

interface Message {
  from: "user" | "ai";
  text: string;
}

export default function AIChatWidget({ initialOpen = false, onBookingCreated }: AIChatWidgetProps) {
  const api = useApi();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [messages, setMessages] = useState<Message[]>([
    {
      from: "ai",
      text: "Salut! Sunt asistentul LARSTEF AI. Cu ce te pot ajuta astăzi?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // Refresh bookings when on bookings page and booking is created
  useEffect(() => {
    if (pathname?.includes("/bookings") && onBookingCreated) {
      // Listen for custom event that indicates a booking was created
      const handleBookingCreated = () => {
        onBookingCreated();
      };
      window.addEventListener("larstef:booking-created", handleBookingCreated);
      return () => {
        window.removeEventListener("larstef:booking-created", handleBookingCreated);
      };
    }
  }, [pathname, onBookingCreated]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setMessages((prev) => [...prev, { from: "user", text: userMessage }]);
    setInput("");
    setLoading(true);

    try {
      const conversationHistory = messages.map((m) => ({
        role: m.from === "user" ? "user" : "assistant",
        content: m.text,
      }));

      console.log("📤 Sending AI request:", { message: userMessage, historyLength: conversationHistory.length });

      const { data } = await api.post<{ response: string; tools?: string[]; toolCalls?: any[] }>("/api/ai/agent", {
        message: userMessage,
        conversationHistory,
      });

      console.log("✅ AI response received:", data);

      setMessages((prev) => [...prev, { from: "ai", text: data.response }]);

      // Check if a booking was created (detect createBooking tool call or success message)
      const hasBookingCreated =
        data.toolCalls?.some((tc: any) => tc.name === "createBooking") ||
        data.response?.toLowerCase().includes("rezervare creată") ||
        data.response?.toLowerCase().includes("rezervarea a fost creată") ||
        data.response?.toLowerCase().includes("booking created") ||
        data.response?.toLowerCase().includes("rezervarea") && data.response?.toLowerCase().includes("succes");

      if (hasBookingCreated) {
        // Trigger refresh after a short delay to allow backend to process
        setTimeout(() => {
          if (onBookingCreated) {
            onBookingCreated();
          }
          // Dispatch custom event for other components (e.g., bookings page)
          window.dispatchEvent(new Event("larstef:booking-created"));
          console.log("🔄 Booking created event dispatched");
        }, 1000);
      }
    } catch (error: any) {
      console.error("❌ AI Agent error:", error);
      console.error("Error details:", {
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        data: error?.response?.data,
        message: error?.message,
        code: error?.code,
        config: error?.config,
      });
      
      let errorMessage = "Eroare la comunicarea cu AI-ul. Te rugăm să încerci din nou.";
      
      if (error?.code === "ECONNABORTED" || error?.message === "Network Error") {
        errorMessage = "Nu mă pot conecta la server. Te rugăm să verifici că backend-ul rulează și să încerci din nou.";
      } else if (error?.response?.status === 401) {
        errorMessage = "Sesiunea a expirat. Te rugăm să te autentifici din nou.";
      } else if (error?.response?.status === 500) {
        errorMessage = "Eroare internă a serverului. Te rugăm să încerci din nou sau să contactezi suportul.";
      } else if (error?.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error?.message) {
        errorMessage = error.message;
      }
      
      setMessages((prev) => [...prev, { from: "ai", text: `Eroare: ${errorMessage}` }]);
    } finally {
      setLoading(false);
    }
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
            placeholder="Ex: Arată-mi rezervările mele"
            disabled={loading}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/50 outline-none transition focus:border-[#6366F1] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#6366F1] text-white transition hover:bg-[#7C3AED] disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Trimite mesaj"
          >
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

