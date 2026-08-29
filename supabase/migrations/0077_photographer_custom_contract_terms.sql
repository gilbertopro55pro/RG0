-- Lets a photographer replace the system's default "תנאים כלליים" clause block
-- (src/lib/contracts.ts's defaultContractTerms) with their own contract terms — every
-- photographer's actual business terms differ, so the default is a starting point, not
-- something everyone should be stuck with forever. null means "use the system default".
alter table public.photographers add column custom_contract_terms text;
