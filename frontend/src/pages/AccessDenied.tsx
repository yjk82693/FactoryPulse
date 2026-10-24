export function AccessDenied() {
  return (
    <div className="config-error">
      <h1>No access to this company</h1>
      <p>Your account is authenticated but is not a member of this FactoryPulse company.</p>
    </div>
  );
}
