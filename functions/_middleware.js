// On the dashboard's own address, send everything except the app and its sync to /fitness/.
const APP_HOST = "fitness.nutriactivewellness.com";

export async function onRequest({ request, next }) {
  const url = new URL(request.url);
  if (url.hostname === APP_HOST && !url.pathname.startsWith("/fitness") && url.pathname !== "/api/fitness-sync") {
    return Response.redirect(url.origin + "/fitness/", 302);
  }
  return next();
}
