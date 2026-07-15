import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { invoke } from "@tauri-apps/api/core";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

const invokeMock = vi.mocked(invoke);

describe("App shell", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

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

  it("submits one message and renders Nova's response", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce({
      model: "llama3.2:latest",
      response: "Hello, Alex. Ready when you are."
    });
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Hello Nova{enter}");

    expect(invokeMock).toHaveBeenCalledWith("submit_message", {
      request: {
        message: "Hello Nova",
        model: "llama3.2:latest"
      }
    });
    expect(await screen.findByText("Hello, Alex. Ready when you are.")).toBeInTheDocument();
    expect(screen.getByText("Hello Nova")).toBeInTheDocument();
    expect(screen.getByLabelText("Message Nova")).toHaveValue("");
  });

  it("guards duplicate sends while Nova is generating", async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: { model: string; response: string }) => void = () => undefined;
    invokeMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Slow request");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByRole("button", { name: "Stop" })).toBeDisabled();
    expect(screen.getByLabelText("Message Nova")).toBeDisabled();

    await user.keyboard("{enter}");

    expect(invokeMock).toHaveBeenCalledTimes(1);

    resolveRequest({ model: "llama3.2:latest", response: "Done." });
    expect(await screen.findByText("Done.")).toBeInTheDocument();
  });

  it("shows friendly provider errors", async () => {
    const user = userEvent.setup();
    invokeMock.mockRejectedValueOnce({
      kind: "ollamaUnavailable",
      message: "Nova could not connect to Ollama.",
      action: "Make sure Ollama is running, then try again."
    });
    render(<App />);

    await user.type(screen.getByLabelText("Message Nova"), "Are you there?");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nova could not connect to Ollama."
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Make sure Ollama is running, then try again."
    );
  });

  it("offers temporary visual theme presets", async () => {
    const user = userEvent.setup();
    render(<App />);

    const shell = screen.getByLabelText("Aether");
    const themeSelector = screen.getByLabelText("Experimental theme");

    expect(shell).toHaveAttribute("data-theme", "crimson");

    await user.selectOptions(themeSelector, "observatory");

    expect(shell).toHaveAttribute("data-theme", "observatory");
  });
});
