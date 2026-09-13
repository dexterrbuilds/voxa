export function useRouter() {
  return {
    replace(path) {
      history.replaceState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
    push(path) {
      history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    },
  };
}
export function usePathname() {
  return location.pathname;
}
export function useSearchParams() {
  return new URLSearchParams(location.search);
}
