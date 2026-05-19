export default defineNuxtRouteMiddleware((to) => {
  if (to.path === "/login" || to.path === "/register") return;
  const token = useCookie<string | null>("auth_token");
  if (!token.value) {
    return navigateTo("/login");
  }
});
