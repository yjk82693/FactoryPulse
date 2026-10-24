import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="config-error">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to Home</Link>
      </p>
    </div>
  );
}
