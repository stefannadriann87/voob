import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtDecode } from "jwt-decode";

/**
 * Middleware pentru protecție rute bazată pe rol
 * CRITICAL FIX (TICKET-017): Verifică rolul în middleware, nu doar existența cookie-ului
 * Rulează pe Edge Runtime pentru performanță maximă
 * 
 * Notă: Folosim jwt-decode pentru a decoda payload-ul (fără verificare semnătură în Edge Runtime).
 * Verificarea completă a semnăturii se face în backend API endpoints.
 */
interface JWTPayload {
  userId: string;
  role: string;
  businessId?: string;
  exp?: number;
  iat?: number;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Rute publice - nu necesită autentificare
  const publicRoutes = [
    "/",
    "/auth/login",
    "/auth/register",
    "/auth/forgot-password",
    "/auth/reset-password",
    "/link",
    "/qr/join",
    "/legal",
  ];
  
  // Verifică dacă ruta este publică
  const isPublicRoute = publicRoutes.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  if (isPublicRoute) {
    return NextResponse.next();
  }
  
  // Rute protejate - necesită autentificare și rol specific
  const roleRoutes: Record<string, string[]> = {
    "/business": ["BUSINESS"],
    "/client": ["CLIENT"],
    "/employee": ["EMPLOYEE"],
    "/admin": ["SUPERADMIN"],
  };
  
  // Verifică dacă ruta necesită un rol specific
  let requiredRole: string | null = null;
  for (const [route, roles] of Object.entries(roleRoutes)) {
    if (pathname.startsWith(route)) {
      requiredRole = roles[0]; // Prima rolă din array (poți extinde pentru multiple)
      break;
    }
  }
  
  // Dacă nu este o rută protejată, permite accesul
  if (!requiredRole) {
    return NextResponse.next();
  }
  
  // Verifică autentificarea prin cookie
  const authCookie = request.cookies.get("voob_auth");
  
  if (!authCookie) {
    // Nu este autentificat - redirect la login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }
  
  // CRITICAL FIX (TICKET-017): Decodează JWT pentru a verifica rolul
  try {
    const token = authCookie.value;
    const decoded = jwtDecode<JWTPayload>(token);
    
    // Verifică dacă token-ul este expirat (dacă are exp claim)
    if (decoded.exp) {
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp < now) {
        // Token expirat - redirect la login
        const loginUrl = new URL("/auth/login", request.url);
        loginUrl.searchParams.set("redirect", pathname);
        loginUrl.searchParams.set("expired", "true");
        return NextResponse.redirect(loginUrl);
      }
    }
    
    // Verifică dacă rolul din token corespunde cu rolul necesar pentru rută
    if (decoded.role && decoded.role !== requiredRole) {
      // Rolul nu corespunde - redirect la dashboard-ul corespunzător rolului sau la login
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      loginUrl.searchParams.set("unauthorized", "true");
      return NextResponse.redirect(loginUrl);
    }
    
    // Token valid și rolul corespunde - permite accesul
    return NextResponse.next();
  } catch (error) {
    // Eroare la decodarea token-ului - redirect la login
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    loginUrl.searchParams.set("invalid", "true");
    return NextResponse.redirect(loginUrl);
  }
}

/**
 * Configurare pentru rutele pe care rulează middleware-ul
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
