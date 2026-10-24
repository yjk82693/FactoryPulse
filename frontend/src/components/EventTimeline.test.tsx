import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EventTimeline } from "./EventTimeline";

describe("EventTimeline", () => {
  it("shows an empty state when there are no events", () => {
    render(<EventTimeline events={[]} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });
});
