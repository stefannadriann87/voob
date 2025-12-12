import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware pentru protecție rute bazată pe rol
 * Rulează pe Edge Runtime pentru performanță maximă
 */
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
  
  // Încearcă să decodeze JWT pentru a verifica rolul
  // Notă: În Edge Runtime nu putem folosi biblioteci grele, deci verificăm doar existența cookie-ului
  // Verificarea exactă a rolului se face în layout-uri (client-side)
  // Aceasta este o protecție de bază - layout-urile fac verificarea completă
  
  return NextResponse.next();
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
