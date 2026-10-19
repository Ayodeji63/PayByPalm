export interface User {
  id: string;
  email: string;
}
export interface Merchant {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  paystack_subaccount: string | null;
  created_at: string;
  updated_at: string;
}
export interface Terminal {
  id: string;
  merchant_id: string;
  label: string;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  disabled_at: string | null;
}
export interface Activity {
  id: string;
  action: string;
  entity_id: string;
  merchant_id: string | null;
  label: string;
  created_at: string;
}
export interface Overview {
  merchants: Merchant[];
  terminals: Terminal[];
  activity: Activity[];
  terminalUrl: string;
  fixture?: boolean;
}
export interface Provision {
  terminal: Terminal;
  key: string;
  url: string;
}
