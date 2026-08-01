import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/display")({
  beforeLoad: () => {
    throw redirect({
      to: "/admin/team",
      search: { tab: "kiosk" },
    });
  },
  component: () => null,
});
