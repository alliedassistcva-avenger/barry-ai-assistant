import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function HomeRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/chat", replace: true });
  }, [navigate]);

  return null;
}

