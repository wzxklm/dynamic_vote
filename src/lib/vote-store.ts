"use client";

import { create } from "zustand";

export interface VoteFormState {
  step: number;
  isBlocked: boolean | null;
  org: string;
  asn: string;
  usage: "proxy" | "website" | null;
  protocol: string | null;
  keyConfig: string | null;
  count: number;
  // IP lookup results
  ipLookupOrg: string;
  ipLookupAsn: string;
  ipLookupCountry: string;
  ipLookupCity: string;
  // Custom input flags
  customOrg: boolean;
  customAsn: boolean;
  customProtocol: boolean;
  customKeyConfig: boolean;
}

interface VoteFormActions {
  setStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setField: <K extends keyof VoteFormState>(key: K, value: VoteFormState[K]) => void;
  reset: (keepOrgAsn?: boolean) => void;
}

const initialState: VoteFormState = {
  step: 1,
  isBlocked: null,
  org: "",
  asn: "",
  usage: null,
  protocol: null,
  keyConfig: null,
  count: 1,
  ipLookupOrg: "",
  ipLookupAsn: "",
  ipLookupCountry: "",
  ipLookupCity: "",
  customOrg: false,
  customAsn: false,
  customProtocol: false,
  customKeyConfig: false,
};

export const useVoteStore = create<VoteFormState & VoteFormActions>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  nextStep: () => set((s) => ({ step: s.step + 1 })),
  prevStep: () => set((s) => ({ step: Math.max(1, s.step - 1) })),
  setField: (key, value) => set({ [key]: value }),
  reset: (keepOrgAsn = false) =>
    set((s) =>
      keepOrgAsn
        ? {
            ...initialState,
            org: s.org,
            asn: s.asn,
            ipLookupOrg: s.ipLookupOrg,
            ipLookupAsn: s.ipLookupAsn,
            ipLookupCountry: s.ipLookupCountry,
            ipLookupCity: s.ipLookupCity,
          }
        : initialState
    ),
}));
