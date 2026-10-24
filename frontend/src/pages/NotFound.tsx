import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="config-error">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Return to dashboard</Link>
      </p>
    </div>
  );
}
