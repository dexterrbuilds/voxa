import { lazy, Suspense } from "react";
export default function dynamic(loader) {
  const Component = lazy(loader);
  return (props) => (
    <Suspense fallback={<p>Loading</p>}>
      <Component {...props} />
    </Suspense>
  );
}
