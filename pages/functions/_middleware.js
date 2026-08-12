const API_PATHS = [
    "/api/",
    "/open_api/",
    "/user_api/",
    "/telegram/",
    "/external/",
];

export async function onRequest(context) {
    const reqPath = new URL(context.request.url).pathname;
    let response;
    if (API_PATHS.map(path => reqPath.startsWith(path)).some(Boolean)) {
        response = await context.env.BACKEND.fetch(context.request);
    } else {
        response = await context.next();
    }
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
