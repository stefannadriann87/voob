"use client";

import { useEffect, useRef, useState } from "react";

interface MapPickerProps {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  onLocationSelect: (address: string, lat: number, lng: number) => void;
  onClose: () => void;
}

declare global {
  interface Window {
    google: any;
    initMap: () => void;
  }
}

export default function MapPicker({ address, latitude, longitude, onLocationSelect, onClose }: MapPickerProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const [searchValue, setSearchValue] = useState(address || "");
  const [isLoading, setIsLoading] = useState(true);
  const autocompleteInputRef = useRef<HTMLInputElement>(null);
  const geocoderRef = useRef<any>(null);

  // Load Google Maps script
  useEffect(() => {
    const script = document.createElement("script");
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    
    if (!apiKey) {
      console.warn("Google Maps API key not found. Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env file.");
      setIsLoading(false);
      return;
    }

    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=initMap`;
    script.async = true;
    script.defer = true;
    
    window.initMap = () => {
      setIsLoading(false);
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
      // Cleanup initMap if it exists
      try {
        delete (window as any).initMap;
      } catch (e) {
        // Ignore if initMap doesn't exist
      }
    };
  }, []);

  // Initialize map
  useEffect(() => {
    if (isLoading || !mapRef.current || !window.google) return;

    const defaultLat = latitude || 44.4268; // Bucharest default
    const defaultLng = longitude || 26.1025;

    const newMap = new window.google.maps.Map(mapRef.current, {
      center: { lat: defaultLat, lng: defaultLng },
      zoom: latitude && longitude ? 15 : 10,
      styles: [
        {
          featureType: "all",
          elementType: "geometry",
          stylers: [{ color: "#1a1a2e" }],
        },
        {
          featureType: "all",
          elementType: "labels.text.fill",
          stylers: [{ color: "#ffffff" }],
        },
        {
          featureType: "all",
          elementType: "labels.text.stroke",
          stylers: [{ color: "#000000" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0a0a1a" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#2a2a3e" }],
        },
      ],
    });

    setMap(newMap);
    geocoderRef.current = new window.google.maps.Geocoder();

    // Create initial marker
    const initialMarker = new window.google.maps.Marker({
      position: { lat: defaultLat, lng: defaultLng },
      map: newMap,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: "#6366F1",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
    });

    setMarker(initialMarker);

    // Update address when marker is dragged
    initialMarker.addListener("dragend", () => {
      const position = initialMarker.getPosition();
      geocoderRef.current.geocode({ location: position }, (results: any[], status: string) => {
        if (status === "OK" && results[0]) {
          setSearchValue(results[0].formatted_address);
        }
      });
    });

    // Update marker when map is clicked
    newMap.addListener("click", (e: any) => {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      initialMarker.setPosition({ lat, lng });
      geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
        if (status === "OK" && results[0]) {
          setSearchValue(results[0].formatted_address);
        }
      });
    });

    // Initialize Places Autocomplete
    if (autocompleteInputRef.current) {
      const autocompleteInstance = new window.google.maps.places.Autocomplete(autocompleteInputRef.current, {
        types: ["address"],
        componentRestrictions: { country: "ro" }, // Restrict to Romania
      });

      autocompleteInstance.addListener("place_changed", () => {
        const place = autocompleteInstance.getPlace();
        if (place.geometry) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          newMap.setCenter({ lat, lng });
          newMap.setZoom(17);
          initialMarker.setPosition({ lat, lng });
          setSearchValue(place.formatted_address || "");
        }
      });

      setAutocomplete(autocompleteInstance);
    }
  }, [isLoading, latitude, longitude]);

  const handleConfirm = () => {
    if (marker && map) {
      const position = marker.getPosition();
      const lat = position.lat();
      const lng = position.lng();
      onLocationSelect(searchValue || address, lat, lng);
      onClose();
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocația nu este suportată de browser-ul tău.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (map && marker) {
          map.setCenter({ lat, lng });
          map.setZoom(17);
          marker.setPosition({ lat, lng });
          geocoderRef.current?.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
            if (status === "OK" && results[0]) {
              setSearchValue(results[0].formatted_address);
            }
          });
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        alert("Nu am putut obține locația ta. Te rog selectează manual pe hartă.");
      }
    );
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="rounded-3xl border border-white/10 bg-[#0B0E17] p-8">
          <div className="flex items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#6366F1] border-t-transparent"></div>
            <p className="text-white">Se încarcă harta...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B0E17] p-8">
          <h3 className="text-xl font-semibold text-white mb-4">Google Maps API Key necesar</h3>
          <p className="text-sm text-white/70 mb-4">
            Pentru a folosi selectorul de hartă, adaugă <code className="text-[#6366F1]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> în fișierul <code className="text-[#6366F1]">.env.local</code>
          </p>
          <button
            onClick={onClose}
            className="rounded-xl bg-[#6366F1] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
          >
            Închide
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-[#0B0E17] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 bg-[#0B0E17] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Selectează locația business-ului</h3>
            <button
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10"
            >
              <i className="fas fa-times" />
            </button>
          </div>
          
          {/* Search input */}
          <div className="relative">
            <input
              ref={autocompleteInputRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Caută adresă sau locație..."
              className="w-full rounded-xl border border-white/10 bg-[#0B0E17]/60 px-4 py-3 pl-10 text-white outline-none transition focus:border-[#6366F1]"
            />
            <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
          </div>
          
          <button
            onClick={handleUseCurrentLocation}
            className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
          >
            <i className="fas fa-crosshairs mr-2" />
            Folosește locația mea
          </button>
        </div>

        {/* Map */}
        <div ref={mapRef} className="h-[500px] w-full" />

        {/* Footer */}
        <div className="border-t border-white/10 bg-[#0B0E17] p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/60">
              <i className="fas fa-info-circle mr-2" />
              Glisează pinul sau caută o adresă pentru a selecta locația exactă
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/10"
              >
                Anulează
              </button>
              <button
                onClick={handleConfirm}
                className="rounded-xl bg-[#6366F1] px-6 py-2 text-sm font-semibold text-white transition hover:bg-[#7C3AED]"
              >
                Confirmă locația
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

