import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App shell", () => {
  it("renders Nova's empty state", () => {
    render(<App />);

    expect(screen.getAllByText("Nova")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Hello, Alex." })).toBeInTheDocument();
    expect(screen.getByText("What's on the agenda today?")).toBeInTheDocument();
  });

  it("focuses the composer on launch", () => {
    render(<App />);

    expect(screen.getByLabelText("Message Nova")).toHaveFocus();
  });

  it("keeps the static shell from submitting conversation behavior", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Hello Nova{enter}");

    expect(screen.getByLabelText("Message Nova")).toHaveValue("Hello Nova");
  });
});
