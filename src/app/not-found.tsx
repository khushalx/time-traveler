import Link from "next/link";

export default function NotFound() {
  return (
    <main className="lost-page">
      <span className="eyebrow">404 / A WRONG TURN IN TIME</span>
      <h1>
        This moment
        <br />
        doesn’t exist.
      </h1>
      <p>Let’s get you back to the photographs.</p>
      <Link className="primary-button" href="/">
        Back to Time Traveler <span aria-hidden="true">→</span>
      </Link>
    </main>
  );
}
