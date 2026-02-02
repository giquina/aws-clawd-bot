'use client';

import { useState, useCallback } from 'react';
import { api, type Project, type ProjectsResponse, type TodoTask } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useAutoRefresh } from '@/hooks/use-auto-refresh';
import { AutoRefreshIndicator, RefreshPulse } from '@/components/auto-refresh-indicator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import {
  FolderGit2,
  Search,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle,
  Circle,
  Clock,
  RefreshCw,
  Rocket,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const REFRESH_INTERVAL_MS = 60000; // 60 seconds
const STORAGE_KEY = 'clawdbot-projects-auto-refresh';

export default function ProjectsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [projectTasks, setProjectTasks] = useState<Record<string, TodoTask[]>>({});
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());
  const [deploying, setDeploying] = useState<string | null>(null);
  const [confirmDeploy, setConfirmDeploy] = useState<string | null>(null);
  const toast = useToast();

  const fetchProjects = useCallback(async () => {
    return api.getProjects();
  }, []);

  const {
    data: projectsData,
    loading,
    error,
    lastUpdated,
    isAutoRefreshEnabled,
    isRefreshing,
    toggleAutoRefresh,
    refresh,
  } = useAutoRefresh<ProjectsResponse>({
    fetchFunction: fetchProjects,
    intervalMs: REFRESH_INTERVAL_MS,
    enabled: true,
    storageKey: STORAGE_KEY,
  });

  const projects = projectsData?.projects || [];

  async function fetchProjectTasks(repoName: string) {
    if (projectTasks[repoName]) return;

    setLoadingTasks(prev => new Set(prev).add(repoName));
    try {
      const data = await api.getProjectStatus(repoName);
      if (data.tasks) {
        setProjectTasks(prev => ({ ...prev, [repoName]: data.tasks! }));
      }
    } catch (err) {
      console.error(`Failed to fetch tasks for ${repoName}:`, err);
    } finally {
      setLoadingTasks(prev => {
        const next = new Set(prev);
        next.delete(repoName);
        return next;
      });
    }
  }

  function toggleExpanded(repoName: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(repoName)) {
        next.delete(repoName);
      } else {
        next.add(repoName);
        fetchProjectTasks(repoName);
      }
      return next;
    });
  }

  async function handleDeploy(repoName: string) {
    setDeploying(repoName);
    try {
      const result = await api.deployProject(repoName);
      if (result.success) {
        toast.success(`Deployed ${repoName} successfully!`);
      } else {
        toast.error(`Deploy failed: ${result.errors}`);
      }
    } catch (err) {
      toast.error(`Deploy error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setDeploying(null);
    }
  }

  function initiateDeployment(repoName: string) {
    setConfirmDeploy(repoName);
  }

  function confirmDeployment() {
    if (confirmDeploy) {
      handleDeploy(confirmDeploy);
      setConfirmDeploy(null);
    }
  }

  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    project.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      TypeScript: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      JavaScript: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      Python: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      HTML: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      CSS: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      Java: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      Swift: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    };
    return colors[language] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-gray-600 dark:text-gray-400">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              <CardTitle>Error Loading Projects</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={refresh} variant="primary">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
            <FolderGit2 className="h-8 w-8 text-primary-600" />
            Projects
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {projects.length} GitHub repositories
          </p>
        </div>
        <div className="flex items-center gap-4">
          <AutoRefreshIndicator
            lastUpdated={lastUpdated}
            isEnabled={isAutoRefreshEnabled}
            isRefreshing={isRefreshing}
            onToggle={toggleAutoRefresh}
            intervalMs={REFRESH_INTERVAL_MS}
          />
          <Button onClick={refresh} variant="outline" size="md" disabled={isRefreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
        <Input
          type="text"
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredProjects.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No projects found</CardTitle>
            <CardDescription>
              {searchQuery ? 'Try a different search term.' : 'No projects available.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <RefreshPulse isRefreshing={isRefreshing}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredProjects.map((project) => {
              const isExpanded = expandedProjects.has(project.name);
              const tasks = projectTasks[project.name] || [];
              const isLoadingTasks = loadingTasks.has(project.name);
              const completedTasks = tasks.filter(t => t.completed).length;
              const totalTasks = tasks.length;

              return (
                <Card key={project.name} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base truncate">
                            {project.name}
                          </CardTitle>
                          {project.private && (
                            <Badge variant="outline" className="text-xs">
                              Private
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="text-sm mt-1 line-clamp-2">
                          {project.description || 'No description'}
                        </CardDescription>
                      </div>
                      <a
                        href={`https://github.com/${project.fullName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>

                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {project.language && (
                        <Badge className={getLanguageColor(project.language)}>
                          {project.language}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                        <Clock className="h-3 w-3" />
                        {formatDate(project.updatedAt)}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 flex flex-col justify-end">
                    {/* Tasks Section */}
                    {isExpanded && (
                      <div className="mb-4">
                        {isLoadingTasks ? (
                          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading tasks...
                          </div>
                        ) : tasks.length > 0 ? (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600 dark:text-gray-400">
                                Tasks: {completedTasks}/{totalTasks}
                              </span>
                              <div className="w-24 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 dark:bg-green-400 transition-all"
                                  style={{ width: `${totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0}%` }}
                                />
                              </div>
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {tasks.slice(0, 10).map((task) => (
                                <div
                                  key={task.id}
                                  className="flex items-start gap-2 text-sm py-1"
                                >
                                  {task.completed ? (
                                    <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <Circle className="h-4 w-4 text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5" />
                                  )}
                                  <span className={task.completed ? 'text-gray-400 dark:text-gray-500 line-through' : 'text-gray-700 dark:text-gray-300'}>
                                    {task.title}
                                  </span>
                                </div>
                              ))}
                              {tasks.length > 10 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                                  +{tasks.length - 10} more tasks
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 dark:text-gray-400">No TODO.md found</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2 mt-auto">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(project.name)}
                        className="flex-1"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-1" />
                            Hide Tasks
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-1" />
                            View Tasks
                          </>
                        )}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => initiateDeployment(project.name)}
                        disabled={deploying === project.name}
                      >
                        {deploying === project.name ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Rocket className="h-4 w-4 mr-1" />
                            Deploy
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </RefreshPulse>
      )}

      {/* Deploy Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmDeploy !== null}
        onClose={() => setConfirmDeploy(null)}
        onConfirm={confirmDeployment}
        title="Confirm Deployment"
        message={`Are you sure you want to deploy ${confirmDeploy}? This will trigger the deployment process on the server.`}
        confirmText="Deploy"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
}
