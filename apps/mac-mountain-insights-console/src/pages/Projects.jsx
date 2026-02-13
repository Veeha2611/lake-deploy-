import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Search, Filter, Briefcase, TestTube, TrendingUp, Send, Trash2, Download } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useQuery } from '@tanstack/react-query';
import { macEngineInvoke } from '@/api/macEngineClient';
import { runSSOTQuery } from '@/api/ssotQuery';
import { MAC_AWS_ONLY } from '@/lib/mac-app-flags';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import ProjectDetailDrawer from '@/components/projects/ProjectDetailDrawer';
import NewProjectForm from '@/components/projects/NewProjectForm';
import ProjectsUserGuide from '@/components/projects/ProjectsUserGuide';
import TestDataGenerator from '@/components/projects/TestDataGenerator';
import ProjectUpdatesHistory from '@/components/projects/ProjectUpdatesHistory';
import ScenarioModelDrawer from '@/components/projects/ScenarioModelDrawer';
import PipelineRunner from '@/components/projects/PipelineRunner';
import ProjectSubmissionForm from '@/components/projects/ProjectSubmissionForm';
import ProjectSubmissionsQueue from '@/components/projects/ProjectSubmissionsQueue';
import { isCapitalCommittee as checkCapitalCommittee } from '@/components/projects/CapitalCommitteeCheck';

const PROJECTS_SQL = `
SELECT
  project_id,
  entity,
  project_name,
  project_type,
  state,
  COALESCE(NULLIF(stage, ''), 'Unknown') AS stage,
  COALESCE(NULLIF(priority, ''), 'Unranked') AS priority,
  owner,
  partner,
  split_pct,
  investment,
  npv,
  irr AS irr_pct,
  moic,
  notes
FROM curated_core.projects_enriched_live
ORDER BY entity, project_name
LIMIT 200
`;

const priorityColors = {
  'Must Win': 'bg-red-100 text-red-800 border-red-200',
  'High': 'bg-orange-100 text-orange-800 border-orange-200',
  'Medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Low': 'bg-blue-100 text-blue-800 border-blue-200',
  'Unranked': 'bg-gray-100 text-gray-600 border-gray-200'
};

const stageColors = {
  'Signed': 'bg-green-100 text-green-800 border-green-200',
  'Final Docs': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'Contract Discussion': 'bg-cyan-100 text-cyan-800 border-cyan-200',
  'Project Discussion': 'bg-blue-100 text-blue-800 border-blue-200',
  'Term Sheet': 'bg-purple-100 text-purple-800 border-purple-200',
  'Unknown': 'bg-gray-100 text-gray-600 border-gray-200'
};

// CSV parser helper
const parseCSVLine = (line) => {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
};

export default function Projects() {
  const awsOnlyUi = MAC_AWS_ONLY;
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [stageFilter, setStageFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [includeTestData, setIncludeTestData] = useState(false);
  const [modelProjectId, setModelProjectId] = useState(null);
  const [modelProjectName, setModelProjectName] = useState(null);
  const [showPipelineRunner, setShowPipelineRunner] = useState(false);
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [showSubmissionsQueue, setShowSubmissionsQueue] = useState(false);
  const [isCapitalCommittee, setIsCapitalCommittee] = useState(false);
  const [lastCreatedProjectId, setLastCreatedProjectId] = useState(
    () => localStorage.getItem('lastCreatedProjectId') || null
  );
  const [dataSource, setDataSource] = useState('athena');
  const [activeTab, setActiveTab] = useState('inputs');
  const [authorized, setAuthorized] = useState(null);

  // S3 fallback loader
  const loadProjectsFromS3 = React.useCallback(async () => {
    if (awsOnlyUi) {
      return [];
    }
    try {
      setDataSource('s3');
      
      const response = await macEngineInvoke('listProjectUpdates', {
        action: 'list'
      });
      
      const files = response.data.files || [];
      
      if (files.length === 0) {
        return [];
      }
      
      const projectsMap = new Map();
      
      for (const file of files) {
        try {
          const contentResponse = await macEngineInvoke('listProjectUpdates', {
            action: 'content',
            key: file.key
          });
          
          const lines = contentResponse.data.content.split('\n');
          if (lines.length < 2) continue;
          
          const headers = lines[0].split(',').map(h => h.trim());
          
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const values = parseCSVLine(line);
            if (values.length !== headers.length) continue;
            
            const project = {};
            headers.forEach((header, idx) => {
              project[header] = values[idx];
            });
            
            if (project.project_id) {
              const existing = projectsMap.get(project.project_id);
              if (!existing || file.last_modified > (existing._timestamp || '')) {
                project._timestamp = file.last_modified;
                project.is_test = project.is_test === 'true' || project.is_test === true;
                projectsMap.set(project.project_id, project);
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse file:', file.key, err);
        }
      }
      
      return Array.from(projectsMap.values());
      
    } catch (error) {
      console.error('Failed to load projects from S3:', error);
      toast.error('Failed to load projects from both Athena and S3');
      return [];
    }
  }, []);

  const { data: projectsData, isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      try {
        const response = await runSSOTQuery({
          queryId: 'projects_pipeline',
          sql: PROJECTS_SQL,
          label: 'Projects Pipeline'
        });
        
        const apiData = response.data;
        const rows = apiData?.data_rows || [];
        
        // Log evidence
        console.log('[Projects] Evidence:', {
          athena_query_execution_id: apiData?.athena_query_execution_id,
          rows_returned: apiData?.rows_returned || rows.length,
          generated_sql: apiData?.generated_sql || PROJECTS_SQL
        });
        
        if (rows.length > 0) {
          setDataSource('athena');
          const mapped = rows.map(row => {
            const values = Array.isArray(row) ? row : Object.values(row);
            return {
              project_id: values[0],
              entity: values[1],
              project_name: values[2],
              project_type: values[3],
              state: values[4],
              stage: values[5],
              priority: values[6],
              owner: values[7],
              partner: values[8],
              split_pct: values[9],
              investment: values[10],
              npv: values[11],
              irr_pct: values[12],
              moic: values[13],
              notes: values[14],
              is_test: false,
              _evidence: {
                athena_query_execution_id: apiData?.athena_query_execution_id,
                rows_returned: apiData?.rows_returned || rows.length,
                generated_sql: apiData?.generated_sql || PROJECTS_SQL
              }
            };
          });
          return mapped;
        }
        
        if (!awsOnlyUi) {
          console.log('Athena returned 0 rows, falling back to S3...');
          return await loadProjectsFromS3();
        }
        return [];
        
      } catch (error) {
        if (awsOnlyUi) {
          console.error('Athena query failed:', error);
          throw error;
        }
        console.error('Athena query failed, falling back to S3:', error);
        return await loadProjectsFromS3();
      }
    },
    refetchInterval: 60000,
    enabled: authorized === true,
  });

  // Check access control
  React.useEffect(() => {
    setAuthorized(true);
  }, []);

  // Check Capital Committee status
  React.useEffect(() => {
    checkCapitalCommittee().then(setIsCapitalCommittee).catch(() => setIsCapitalCommittee(false));
  }, []);

  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <Card className="max-w-md border-2 border-red-500">
          <CardContent className="pt-6 text-center">
            <h1 className="text-xl font-bold text-red-600 mb-2">Access Restricted</h1>
            <p className="text-muted-foreground">
              This page is temporarily restricted during maintenance.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const projects = projectsData || [];

  const filteredProjects = projects.filter(project => {
    const matchesSearch = !searchTerm || 
      project.project_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEntity = entityFilter === 'all' || project.entity === entityFilter;
    const matchesState = stateFilter === 'all' || project.state === stateFilter;
    const matchesType = typeFilter === 'all' || project.project_type === typeFilter;
    const matchesStage = stageFilter === 'all' || project.stage === stageFilter;
    const matchesPriority = priorityFilter === 'all' || project.priority === priorityFilter;
    const matchesTestFilter = includeTestData || !project.is_test;
    
    return matchesSearch && matchesEntity && matchesState && matchesType && matchesStage && matchesPriority && matchesTestFilter;
  });

  const uniqueEntities = [...new Set(projects.map(p => p.entity).filter(Boolean))].sort();
  const uniqueStates = [...new Set(projects.map(p => p.state).filter(Boolean))].sort();
  const uniqueTypes = [...new Set(projects.map(p => p.project_type).filter(Boolean))].sort();
  const uniqueStages = [...new Set(projects.map(p => p.stage).filter(Boolean))].sort();
  const uniquePriorities = [...new Set(projects.map(p => p.priority).filter(Boolean))].sort();

  const handleRowClick = (project) => {
    if (awsOnlyUi) {
      setModelProjectId(project.project_id);
      setModelProjectName(project.project_name || 'Project');
      setActiveTab('inputs');
      return;
    }
    setSelectedProject(project);
    setShowDetailDrawer(true);
  };

  const handleDeleteProject = async (e, project) => {
    e.stopPropagation();

    if (awsOnlyUi) {
      toast.info('Project delete is not enabled in AWS-only mode yet.');
      return;
    }
    
    if (!window.confirm(`Delete "${project.project_name}"?`)) return;

    try {
      // Find the most recent file containing this project
      const listResponse = await macEngineInvoke('listProjectUpdates', {
        action: 'list'
      });
      
      const files = (listResponse.data.files || []).sort((a, b) => 
        new Date(b.last_modified) - new Date(a.last_modified)
      );
      
      // Try to delete by finding the project in the most recent files
      for (const file of files) {
        const contentResponse = await macEngineInvoke('listProjectUpdates', {
          action: 'content',
          key: file.key
        });
        
        const lines = contentResponse.data.content.split('\n');
        let found = false;
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const values = parseCSVLine(line);
          if (values[0] === project.project_id) {
            found = true;
            break;
          }
        }
        
        if (found) {
          await macEngineInvoke('deleteProject', { s3_key: file.key });
          toast.success('Project deleted');
          refetch();
          return;
        }
      }
      
      toast.error('Project not found in S3');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(`Failed to delete: ${error.message}`);
    }
  };

  const handleDownloadResults = async (e, project) => {
    e.stopPropagation();
    try {
      const response = await macEngineInvoke('downloadPipelineResults', {
        projectId: project.project_id
      });

      const downloadUrl = response?.data?.download_url;
      if (downloadUrl) {
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = `pipeline_results_${project.project_id}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast.success('Results download started');
        return;
      }

      const outputs = response?.data?.outputs || [];
      if (outputs.length > 0) {
        toast.info('Pipeline results found but no download link returned.');
        return;
      }

      toast.error(response?.data?.error || 'No pipeline results available');
    } catch (error) {
      toast.error(`Download failed: ${error.message}`);
    }
  };

  return (
    <div className="max-w-[1800px] mx-auto px-6 py-8">
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6"
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--mac-forest)] to-[var(--mac-dark)] bg-clip-text text-transparent mb-2">
              Projects & Pipeline
            </h1>
            <p className="text-muted-foreground text-sm font-medium">
              Track and manage your project portfolio
            </p>
            {dataSource === 's3' && (
              <div className="mt-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 rounded-lg p-2 text-xs">
                <p className="text-amber-800 dark:text-amber-200">
                  📁 Showing projects from S3 change-files (ETL/Athena pending or unavailable)
                </p>
              </div>
            )}
            {awsOnlyUi && (
              <div className="mt-2 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg p-2 text-xs">
                <p className="text-emerald-800 dark:text-emerald-200">
                  ✅ AWS-only mode: SSOT reads enabled. Write actions will be wired to MAC Engine + Monday.
                </p>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {!awsOnlyUi && (
              <ProjectsUserGuide />
            )}
            {!awsOnlyUi && (
              <ProjectUpdatesHistory onMount={(refreshFn) => {
                window.refreshHistoryFn = refreshFn;
              }} />
            )}
            {!awsOnlyUi && (
              <TestDataGenerator onSuccess={refetch} />
            )}
            <Button
              variant="outline"
              onClick={() => setShowPipelineRunner(true)}
            >
              <Briefcase className="w-4 h-4 mr-2" />
              Pipeline Runner
            </Button>
            {!awsOnlyUi && isCapitalCommittee && (
              <Button
                variant="outline"
                onClick={() => setShowSubmissionsQueue(true)}
                className="border-amber-500 text-amber-700 hover:bg-amber-50"
              >
                <Briefcase className="w-4 h-4 mr-2" />
                Committee Queue
              </Button>
            )}
            {!awsOnlyUi && (
              <Button
                variant="outline"
                onClick={() => setShowSubmissionForm(true)}
              >
                <Send className="w-4 h-4 mr-2" />
                Submit Project
              </Button>
            )}
            {lastCreatedProjectId && (
              <Button 
                variant="outline"
                onClick={() => {
                  setModelProjectId(lastCreatedProjectId);
                  setModelProjectName('Last Project');
                }}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Scenario Modeling
              </Button>
            )}
            {!awsOnlyUi && (
              <Button 
                onClick={() => setShowNewForm(true)}
                className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            )}
          </div>
        </div>
      </motion.header>

      <Card className="mb-6 border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 w-fit">
              <TestTube className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-medium text-amber-800 dark:text-amber-200">Include Test Data</span>
              <Switch 
                checked={includeTestData}
                onCheckedChange={setIncludeTestData}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Entities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {uniqueEntities.map(entity => (
                  <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {uniqueStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {uniqueTypes.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={stageFilter} onValueChange={setStageFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Stages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stages</SelectItem>
                {uniqueStages.map(stage => (
                  <SelectItem key={stage} value={stage}>{stage}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All Priorities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                {uniquePriorities.map(priority => (
                  <SelectItem key={priority} value={priority}>{priority}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-lg">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Briefcase className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No projects found</p>
              <Button 
                variant="outline" 
                onClick={() => setShowNewForm(true)}
                className="mt-4"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Project
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Entity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      State
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Stage
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      Owner
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      NPV
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      IRR
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                      MOIC
                    </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredProjects.map((project, idx) => (
                    <motion.tr
                      key={project.project_id || idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.02 }}
                      onClick={() => handleRowClick(project)}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-slate-900 dark:text-slate-100">
                            {project.project_name}
                          </p>
                          {project.is_test && (
                            <Badge variant="outline" className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                              Test
                            </Badge>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setModelProjectId(project.project_id);
                              setModelProjectName(project.project_name);
                              setActiveTab('scenarios');
                            }}
                            className="text-xs h-6 px-2"
                          >
                            View Scenarios
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => handleDownloadResults(e, project)}
                            className="text-xs h-6 px-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                          {!awsOnlyUi && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleDeleteProject(e, project)}
                              className="text-xs h-6 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {project.entity || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {project.state || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {project.project_type || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${stageColors[project.stage] || 'bg-gray-100 text-gray-600'}`}>
                          {project.stage}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-xs ${priorityColors[project.priority] || 'bg-gray-100 text-gray-600'}`}>
                          {project.priority}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        {project.owner || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {project.npv ? `$${parseInt(project.npv).toLocaleString()}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {project.irr_pct ? `${parseFloat(project.irr_pct).toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {project.moic ? `${parseFloat(project.moic).toFixed(2)}x` : '-'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {!awsOnlyUi && (
        <ProjectDetailDrawer
          isOpen={showDetailDrawer}
          onClose={() => setShowDetailDrawer(false)}
          project={selectedProject}
          onSave={refetch}
        />
      )}

      {!awsOnlyUi && (
        <NewProjectForm
          isOpen={showNewForm}
          onClose={() => setShowNewForm(false)}
          onSuccess={refetch}
          onOpenModel={(projectId, projectName) => {
            setLastCreatedProjectId(projectId);
            localStorage.setItem('lastCreatedProjectId', projectId);
            setModelProjectId(projectId);
            setModelProjectName(projectName);
          }}
        />
      )}

      <ScenarioModelDrawer
        isOpen={!!modelProjectId}
        onClose={() => {
          setModelProjectId(null);
          setModelProjectName(null);
          setActiveTab('inputs');
        }}
        projectId={modelProjectId}
        projectName={modelProjectName || 'Project'}
        defaultTab={activeTab}
      />

      <PipelineRunner
        isOpen={showPipelineRunner}
        onClose={() => setShowPipelineRunner(false)}
      />

      {!awsOnlyUi && (
        <ProjectSubmissionForm
          isOpen={showSubmissionForm}
          onClose={() => setShowSubmissionForm(false)}
          onSuccess={refetch}
        />
      )}

      {!awsOnlyUi && (
        <ProjectSubmissionsQueue
          isOpen={showSubmissionsQueue}
          onClose={() => setShowSubmissionsQueue(false)}
        />
      )}
    </div>
  );
}
