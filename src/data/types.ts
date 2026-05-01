export interface RepoIndexEntry {
  name: string;
  dateRange: [string, string] | null;
  dayCount: number;
  dayWithDriftCount: number;
}

export interface RepoIndex {
  generatedAt: string;
  repos: RepoIndexEntry[];
}

export interface DayPoint {
  date: string;
  lineDrift: number | null;
  conflictDrift: number | null;
  fileDrift: number | null;
  branchesTotal: number | null;
  branchesAnalyzed: number | null;
  branchesFinal: number | null;
  commits: number | null;
}

export interface RepoTimeSeries {
  repo: string;
  days: DayPoint[];
}
