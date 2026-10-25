export const DELIVERY_CHARGE = 70;
export const FREE_DELIVERY_THRESHOLD = 2000;

export function getDeliveryCharge(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_CHARGE;
}

export function getBulkOrderUrl(
  number: string,
  details: {
    name: string;
    phone: string;
    requirement: string;
  },
) {
  const message = `Hello SHAVIBE CANDLE,\n\nI want to enquire about delivery.\n\nName: ${details.name}\nPhone: ${details.phone}\nRequirement: ${details.requirement}\n\nPlease contact me regarding availability and delivery.`;
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;
}
