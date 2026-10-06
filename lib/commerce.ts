export type DeliveryArea = {
  pincode: string;
  deliveryCharge: number;
  enabled?: boolean;
};

export function normalizePincode(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

export function isValidPincode(value: string) {
  return /^\d{6}$/.test(value);
}

export function getBulkOrderUrl(
  number: string,
  details: {
    name: string;
    phone: string;
    location: string;
    requirement: string;
  },
) {
  const message = `Hello SHAVIBE CANDLE,\n\nI want to enquire about delivery.\n\nName: ${details.name}\nPhone: ${details.phone}\nPincode: ${details.location}\nRequirement: ${details.requirement}\n\nPlease contact me regarding availability and delivery.`;
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
