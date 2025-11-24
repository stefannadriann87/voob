"use client";

import { useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import useAuth from "../hooks/useAuth";
import useBusiness from "../hooks/useBusiness";

/**
 * Component to handle deep links and pending business attachments
 * Should be included in the root layout or a high-level component
 */
export default function DeepLinkHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, hydrated } = useAuth();
  const { linkClientToBusiness, fetchBusinesses } = useBusiness();

  // Extract business ID from URL (supports both ?biz= and ?businessId=)
  const extractBusinessId = (url: string | null): string | null => {
    if (!url) return null;
    try {
      const urlObj = new URL(url, window.location.origin);
      return urlObj.searchParams.get("biz") || urlObj.searchParams.get("businessId");
    } catch {
      return null;
    }
  };

  // Handle deep link on mount and URL changes
  useEffect(() => {
    if (!hydrated) return;

    // Check for business ID in current URL
    const bizId = searchParams.get("biz") || searchParams.get("businessId");
    
    // Also check for deep link in window.location (for app deep links)
    const currentUrl = typeof window !== "undefined" ? window.location.href : null;
    const deepLinkBizId = extractBusinessId(currentUrl);

    const businessId = bizId || deepLinkBizId;

    if (!businessId) {
      // Check for pending business ID in localStorage
      const pendingBizId = typeof window !== "undefined" 
        ? window.localStorage.getItem("larstef_pending_business_id")
        : null;
      
      if (pendingBizId && user && user.role === "CLIENT") {
        // User just logged in, attach pending business
        linkClientToBusiness(pendingBizId, "QR")
          .then(() => {
            fetchBusinesses({ scope: "linked" });
            if (typeof window !== "undefined") {
              window.localStorage.removeItem("larstef_pending_business_id");
            }
          })
          .catch((err) => {
            console.error("Failed to attach pending business:", err);
          });
      }
      return;
    }

    // Store pending business ID if user is not authenticated
    if (!user && typeof window !== "undefined") {
      window.localStorage.setItem("larstef_pending_business_id", businessId);
      return;
    }

    // Attach business if user is authenticated and is a client
    if (user && user.role === "CLIENT") {
      linkClientToBusiness(businessId, "QR")
        .then(() => {
          fetchBusinesses({ scope: "linked" });
          // Clear pending business ID
          if (typeof window !== "undefined") {
            window.localStorage.removeItem("larstef_pending_business_id");
          }
          // Redirect to dashboard if on link page
          if (pathname === "/link") {
            setTimeout(() => router.push("/client/dashboard"), 1000);
          }
        })
        .catch((err) => {
          console.error("Failed to attach business from deep link:", err);
        });
    }
  }, [hydrated, user, searchParams, pathname, linkClientToBusiness, fetchBusinesses, router]);

  // Listen for deep link events (for mobile apps)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleDeepLink = (event: MessageEvent) => {
      // Handle deep link messages from mobile app
      if (event.data && typeof event.data === "object" && "url" in event.data) {
        const url = event.data.url as string;
        const bizId = extractBusinessId(url);
        if (bizId && user && user.role === "CLIENT") {
          linkClientToBusiness(bizId, "QR")
            .then(() => {
              fetchBusinesses({ scope: "linked" });
            })
            .catch((err) => {
              console.error("Failed to attach business from deep link event:", err);
            });
        } else if (bizId && !user) {
          // Store for later
          window.localStorage.setItem("larstef_pending_business_id", bizId);
        }
      }
    };

    window.addEventListener("message", handleDeepLink);
    return () => {
      window.removeEventListener("message", handleDeepLink);
    };
  }, [user, linkClientToBusiness, fetchBusinesses]);

  return null; // This component doesn't render anything
}

