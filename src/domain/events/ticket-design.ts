export const ticketLayouts = ["logo", "artwork", "front"] as const;
export type TicketDesign = {
  layout: (typeof ticketLayouts)[number];
  accent: string;
  note: string;
  /** Optimized JPEG, shared by every ticket for this event. */
  artwork: string | null;
};
export const defaultTicketDesign: TicketDesign = {
  layout: "logo",
  accent: "#7e22ce",
  note: "",
  artwork: null,
};
