export interface CompressionConfig {
  daily?: {
    enabled?: boolean;
  };
  weekly?: {
    enabled?: boolean;
    schedule?: string;
  };
  monthly?: {
    enabled?: boolean;
    schedule?: string;
  };
}