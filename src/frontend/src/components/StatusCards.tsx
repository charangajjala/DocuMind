import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Clock, 
  Brain, 
  Target, 
  CheckCircle2, 
  AlertCircle,
  Zap,
  TrendingUp,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatusCardsProps {
  status: 'idle' | 'processing' | 'success' | 'error';
  processingTime?: number;
  aiConfidence?: number;
  fieldsFound?: number;
  isProcessing?: boolean;
  extractionStats?: {
    success_rate?: number;
    ocr_grounded_count?: number;
    visual_only_count?: number;
    total_fields_requested?: number;
  };
}

export function StatusCards({ 
  status, 
  processingTime = 0, 
  aiConfidence = 0, 
  fieldsFound = 0,
  isProcessing = false,
  extractionStats
}: StatusCardsProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'processing':
        return {
          color: 'bg-blue-500',
          textColor: 'text-blue-600',
          bgColor: 'bg-blue-50 dark:bg-blue-950/20',
          icon: Clock,
          label: 'Processing',
          variant: 'secondary' as const
        };
      case 'success':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-600',
          bgColor: 'bg-green-50 dark:bg-green-950/20',
          icon: CheckCircle2,
          label: 'Success',
          variant: 'default' as const
        };
      case 'error':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-600',
          bgColor: 'bg-red-50 dark:bg-red-950/20',
          icon: AlertCircle,
          label: 'Error',
          variant: 'destructive' as const
        };
      default:
        return {
          color: 'bg-gray-400',
          textColor: 'text-gray-600',
          bgColor: 'bg-gray-50 dark:bg-gray-950/20',
          icon: FileText,
          label: 'Ready',
          variant: 'outline' as const
        };
    }
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {/* Status Card */}
      <Card className={cn("border-0 shadow-md transition-all duration-300", statusConfig.bgColor)}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={cn("p-2 rounded-lg", statusConfig.bgColor)}>
                <StatusIcon className={cn("h-5 w-5", statusConfig.textColor)} />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Badge variant={statusConfig.variant} className="text-xs mt-1">
                  {isProcessing && status === 'processing' ? (
                    <div className="flex items-center space-x-1">
                      <div className="h-2 w-2 bg-current rounded-full animate-pulse" />
                      <span>{statusConfig.label}</span>
                    </div>
                  ) : (
                    statusConfig.label
                  )}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Processing Time Card */}
      <Card className="border-0 shadow-md bg-purple-50 dark:bg-purple-950/20 transition-all duration-300 hover:shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Process Time</p>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">
                  {processingTime > 0 ? `${processingTime.toFixed(1)}s` : '--'}
                </p>
                {processingTime > 0 && processingTime < 5 && (
                  <TrendingUp className="h-4 w-4 text-green-500" />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Confidence Card */}
      <Card className="border-0 shadow-md bg-indigo-50 dark:bg-indigo-950/20 transition-all duration-300 hover:shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
              <Brain className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">AI Confidence</p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-400">
                    {aiConfidence > 0 ? `${Math.round(aiConfidence * 100)}%` : '--'}
                  </span>
                  {aiConfidence >= 0.9 && <Zap className="h-4 w-4 text-yellow-500" />}
                </div>
                {aiConfidence > 0 && (
                  <Progress 
                    value={aiConfidence * 100} 
                    className="h-2"
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Fields Found Card */}
      <Card className="border-0 shadow-md bg-emerald-50 dark:bg-emerald-950/20 transition-all duration-300 hover:shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
              <Target className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">Fields Found</p>
              <div className="mt-1">
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {fieldsFound || '--'}
                </p>
                {extractionStats && (
                  <div className="flex items-center space-x-2 mt-1">
                    <div className="flex items-center space-x-1">
                      <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-muted-foreground">
                        {extractionStats.ocr_grounded_count || 0} OCR
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                      <span className="text-xs text-muted-foreground">
                        {extractionStats.visual_only_count || 0} Visual
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
