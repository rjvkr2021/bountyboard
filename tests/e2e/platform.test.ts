import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Worker } from "near-workspaces";

import {
  BOARD_GAS,
  addProposal,
  createWorld,
  voteProposal,
  waitFor,
  type World,
} from "./helpers";

interface SputnikPolicy {
  roles: Array<{
    name: string;
    kind: "Everyone" | { Member: string } | { Group: string[] };
  }>;
}

interface MaintainerView {
  council_derived: boolean;
  promoted: boolean;
}

async function councilMembers(world: World): Promise<string[]> {
  const policy = await world.dao.view<SputnikPolicy>("get_policy");
  const role = policy.roles.find((item) => item.name === "council");
  if (!role || typeof role.kind !== "object" || !("Group" in role.kind)) {
    return [];
  }
  return role.kind.Group;
}

async function maintainers(
  world: World,
): Promise<Record<string, MaintainerView>> {
  return world.board.view<Record<string, MaintainerView>>("get_maintainers");
}

async function waitForMaintainer(
  world: World,
  account: string,
  present: boolean,
): Promise<Record<string, MaintainerView>> {
  return waitFor(
    `maintainer ${account} ${present ? "present" : "removed"}`,
    () => maintainers(world),
    (value) => (value[account] !== undefined) === present,
  );
}

async function setCouncilMember(
  world: World,
  member: string,
  add: boolean,
): Promise<void> {
  const proposal = add
    ? {
        description: "add council member",
        kind: {
          AddMemberToRole: { member_id: member, role: "council" },
        },
      }
    : {
        description: "remove council member",
        kind: {
          RemoveMemberFromRole: { member_id: member, role: "council" },
        },
      };
  const proposalId = await addProposal(world, world.founder, proposal);
  await voteProposal(world, world.founder, proposalId);
  if (!add) {
    await voteProposal(world, world.council2, proposalId);
  }
  await waitFor(
    `council membership ${member}`,
    () => councilMembers(world),
    (members) => members.includes(member) === add,
  );
}

describe("BountyBoard platform hardening", () => {
  let worker: Worker;
  let world: World;

  beforeAll(async () => {
    worker = await Worker.init();
    world = await createWorld(worker, {
      name: "platform",
      maintainers: "single",
      repoMetadata: {
        github_repo_id: 987654321,
        verification_source: "github_app",
      },
    });
  });

  afterAll(async () => {
    await worker?.tearDown();
  });

  it("R1.1 stores numeric repo metadata and maintainer provenance", async () => {
    const repo = await world.board.view<{
      github_repo_id: number;
      verification_source: string;
      created_at: string;
      maintainers: Record<string, MaintainerView>;
    }>("get_repo");

    expect(repo.github_repo_id).toBe(987654321);
    expect(repo.verification_source).toBe("github_app");
    expect(Number(repo.created_at)).toBeGreaterThan(0);
    expect(repo.maintainers[world.founder.accountId]).toMatchObject({
      council_derived: true,
      promoted: false,
    });
    expect(await world.board.view<string>("version")).toBeTruthy();
  });

  it("R1.2 links and unlinks identities by numeric GitHub id", async () => {
    await world.oracle.call(
      world.board,
      "link_identity_with_id",
      {
        github_handle: "platform-contributor",
        github_user_id: 123456,
        near_account: world.contributor.accountId,
      },
      { gas: BOARD_GAS },
    );

    expect(
      await world.board.view<string | null>("get_identity_by_user_id", {
        github_user_id: 123456,
      }),
    ).toBe(world.contributor.accountId);
    expect(
      await world.board.view<number | null>("get_identity_id", {
        github_handle: "platform-contributor",
      }),
    ).toBe(123456);

    await world.oracle.call(
      world.board,
      "unlink_identity",
      { github_handle: "platform-contributor" },
      { gas: BOARD_GAS },
    );

    expect(
      await world.board.view<string | null>("get_identity_by_user_id", {
        github_user_id: 123456,
      }),
    ).toBeNull();
    expect(
      await world.board.view<number | null>("get_identity_id", {
        github_handle: "platform-contributor",
      }),
    ).toBeNull();
  });

  it("R1.3 syncs council members into maintainers and removes derived roles", async () => {
    await setCouncilMember(world, world.council2.accountId, true);

    await world.payer.call(world.board, "sync_council_maintainers", {}, {
      gas: 150n * 10n ** 12n,
    });

    const added = await waitForMaintainer(
      world,
      world.council2.accountId,
      true,
    );
    expect(added[world.council2.accountId]).toMatchObject({
      council_derived: true,
      promoted: false,
    });
    expect(added[world.founder.accountId]).toBeDefined();

    await setCouncilMember(world, world.council2.accountId, false);
    await world.payer.call(world.board, "sync_council_maintainers", {}, {
      gas: 150n * 10n ** 12n,
    });

    const removed = await waitForMaintainer(
      world,
      world.council2.accountId,
      false,
    );
    expect(removed[world.founder.accountId]).toBeDefined();
  });

  it("R1.6 lets a council member promote any account to maintainer or council", async () => {
    await world.founder.call(
      world.board,
      "council_promote_maintainer",
      { account: world.maintainer2.accountId },
      { gas: BOARD_GAS },
    );
    const promoted = await waitForMaintainer(world, world.maintainer2.accountId, true);
    expect(promoted[world.maintainer2.accountId]).toMatchObject({
      promoted: true,
      council_derived: false,
    });

    await world.founder.call(
      world.board,
      "council_promote_council_member",
      { account: world.council2.accountId },
      { gas: BOARD_GAS },
    );
    const request = await waitFor(
      "council promotion request",
      async () =>
        world.board.view<Array<{ account: string; active_proposal_id: number | null }>>(
          "get_council_requests",
          { from: 0, limit: 10 },
        ),
      (requests) =>
        requests.some(
          (item) =>
            item.account === world.council2.accountId &&
            item.active_proposal_id !== null,
        ),
    );
    const proposalId = request.find(
      (item) => item.account === world.council2.accountId,
    )?.active_proposal_id;
    expect(proposalId).toBeTruthy();
    await voteProposal(world, world.founder, Number(proposalId));
    await world.payer.call(
      world.board,
      "sync_council_request",
      { account: world.council2.accountId },
      { gas: BOARD_GAS },
    );
    await world.payer.call(world.board, "sync_council_maintainers", {}, {
      gas: 150n * 10n ** 12n,
    });
    const councilMaintainer = await waitForMaintainer(world, world.council2.accountId, true);
    expect(councilMaintainer[world.council2.accountId]).toMatchObject({
      council_derived: true,
    });
  });

  it("R1.5 lets only the DAO rotate the oracle", async () => {
    await expect(
      world.founder.call(
        world.board,
        "set_oracle",
        { oracle: world.council2.accountId },
        { gas: BOARD_GAS },
      ),
    ).rejects.toThrow(/not the DAO account|NotDao/i);

    await world.dao.call(
      world.board,
      "set_oracle",
      { oracle: world.maintainer3.accountId },
      { gas: BOARD_GAS },
    );

    const repo = await world.board.view<{ oracle: string }>("get_repo");
    expect(repo.oracle).toBe(world.maintainer3.accountId);
  });
});
