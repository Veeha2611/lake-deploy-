import { base44 } from '@/api/base44Client';

// Capital Committee members who can edit scenario assumptions
const CAPITAL_COMMITTEE = [
  'patrick.cochran@icloud.com',
  // Add: jared@macmtn.com, scott@macmtn.com, brian@macmtn.com, adam@macmtn.com
];

export const isCapitalCommittee = async () => {
  try {
    const user = await base44.auth.me();
    return CAPITAL_COMMITTEE.includes(user?.email);
  } catch {
    return false;
  }
};

export const requireCapitalCommittee = async () => {
  const allowed = await isCapitalCommittee();
  if (!allowed) {
    throw new Error('Only Capital Committee members can edit scenarios');
  }
  return true;
};