import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/kiosk-setup")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/team",
      search: { tab: "kiosk" },
    });
  },
  component: () => null,
});
