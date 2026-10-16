export type MeResponse = {
  account: {
    account_id: string;
    email: string;
    display_name: string | null;
    has_password?: boolean;
  };
  user: {
    user_id: string;
    organization_id: string;
    email: string;
    display_name: string | null;
    role: string;
  } | null;
  organization: {
    organization_id: string;
    name: string;
    slug: string;
  } | null;
};

export type OrgMember = {
  membership_id: string;
  email: string;
  display_name: string | null;
  role: string;
  status: string;
  joined_at: string;
};

export type OrgInvitation = {
  invitation_id: string;
  email: string;
  role: string;
  status: string;
  expires_at: string;
  created_at: string;
  invited_by_email: string | null;
};

export type InvitePreview = {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  email: string;
  role: string;
  expires_at: string;
};
