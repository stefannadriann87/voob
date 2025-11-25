export interface DashboardSummary {
  totalBusinesses: number;
  activeBusinesses: number;
  totalBookings: number;
  totalRevenue: number;
  platformRevenue: number;
  smsUsage: {
    totalMessages: number;
    estimatedCost: number;
  };
  aiUsage: {
    totalRequests: number;
    estimatedCost: number;
  };
  paymentDistribution: Record<string, number>;
  slaPercent: number;
  generatedAt: string;
}

export interface BusinessOverviewItem {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  plan?: {
    name: string;
    price: number;
  } | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  monthlyBookings: number;
  monthlySms: number;
  monthlyAi: number;
}

export interface BusinessDetail {
  business: {
    id: string;
    name: string;
    domain: string;
    status: string;
    businessType: string;
    createdAt: string;
  };
  subscription?: {
    planName: string;
    status: string;
    amount: number;
    billingMethod: string;
    currentPeriodEnd: string;
  } | null;
  invoices: Array<{
    id: string;
    amount: number;
    status: string;
    paymentMethod: string;
    issuedAt: string;
  }>;
  payments: {
    totalProcessed: number;
    applicationFee: number;
    methods: Record<string, number>;
  };
  bookings: {
    total: number;
    confirmed: number;
    cancelled: number;
    currentMonth: number;
  };
  usage: {
    smsTotal: number;
    smsMonth: number;
    aiTotal: number;
    aiMonth: number;
  };
  configuration: {
    workingHours: unknown;
    holidays: number;
  };
}

