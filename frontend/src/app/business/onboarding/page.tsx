"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useAuth from "../../../hooks/useAuth";
import useApi from "../../../hooks/useApi";
import CustomSelect from "../../../components/CustomSelect";

type OnboardingStep = "business" | "legal" | "representative" | "bank" | "review";

export default function BusinessOnboardingPage() {
  const { user, hydrated } = useAuth();
  const router = useRouter();
  const api = useApi();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("business");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Business info
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessType, setBusinessType] = useState("GENERAL");

  // Legal info
  const [legalEntityName, setLegalEntityName] = useState("");
  const [cui, setCui] = useState("");
  const [tradeRegisterNumber, setTradeRegisterNumber] = useState("");
  const [vatStatus, setVatStatus] = useState("");
  const [vatCode, setVatCode] = useState("");
  const [registeredStreet, setRegisteredStreet] = useState("");
  const [registeredNumber, setRegisteredNumber] = useState("");
  const [registeredCity, setRegisteredCity] = useState("");
  const [registeredCounty, setRegisteredCounty] = useState("");
  const [registeredPostalCode, setRegisteredPostalCode] = useState("");
  const [businessTypeLegal, setBusinessTypeLegal] = useState("SRL");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [businessDescription, setBusinessDescription] = useState("");

  // Representative info
  const [fullName, setFullName] = useState("");
  const [cnp, setCnp] = useState("");
  const [nationalIdType, setNationalIdType] = useState("CI");
  const [nationalIdSeries, setNationalIdSeries] = useState("");
  const [nationalIdNumber, setNationalIdNumber] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [residenceAddress, setResidenceAddress] = useState("");
  const [representativeEmail, setRepresentativeEmail] = useState("");
  const [representativePhone, setRepresentativePhone] = useState("");
  const [roleInCompany, setRoleInCompany] = useState("REPRESENTATIVE");
  const [beneficialOwner, setBeneficialOwner] = useState(true);

  // Bank account
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountHolder, setAccountHolder] = useState("");

  const [businessId, setBusinessId] = useState<string | null>(null);
  const [onboardingStatus, setOnboardingStatus] = useState<any>(null);

  // Verifică dacă business-ul există deja și determină primul pas necompletat
  useEffect(() => {
    if (!hydrated || !user) return;

    if (user?.role !== "BUSINESS") {
      router.push("/");
      return;
    }

    // Dacă user-ul are deja un business, folosește-l
    if (user.business?.id) {
      setBusinessId(user.business.id);
      // Încarcă datele existente
      setBusinessName(user.business.name || "");
      setBusinessEmail(user.business.email || "");
      setBusinessType(user.business.businessType || "GENERAL");

      // Verifică statusul onboarding-ului pentru a determina primul pas necompletat
      const checkOnboardingStatus = async () => {
        try {
          const { data } = await api.get(`/business-onboarding/status/${user.business!.id}`);
          setOnboardingStatus(data);

          // Determină primul pas necompletat
          if (!data.legalInfo) {
            setCurrentStep("legal");
          } else if (!data.representative) {
            setCurrentStep("representative");
          } else if (!data.bankAccount) {
            setCurrentStep("bank");
          } else {
            setCurrentStep("review");
          }
        } catch (err) {
          console.error("Error checking onboarding status:", err);
          // Dacă nu poate verifica statusul, începe de la legal
          setCurrentStep("legal");
        }
      };

      checkOnboardingStatus();
    }
  }, [user, hydrated, router, api]);

  const handleRegisterBusiness = async () => {
    if (!businessName.trim()) {
      setError("Numele business-ului este obligatoriu.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post("/business-onboarding/register", {
        businessName: businessName.trim(),
        businessEmail: businessEmail.trim() || undefined,
        businessType,
      });

      setBusinessId(data.business.id);
      setCurrentStep("legal");
    } catch (err: any) {
      setError(err.response?.data?.error || "Eroare la crearea business-ului.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveLegalInfo = async () => {
    if (!businessId || !legalEntityName || !cui) {
      setError("Datele legale sunt obligatorii.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post("/business-onboarding/legal-info", {
        businessId,
        legalEntityName,
        cui,
        tradeRegisterNumber: tradeRegisterNumber || undefined,
        vatStatus: vatStatus || undefined,
        vatCode: vatCode || undefined,
        registeredStreet,
        registeredNumber,
        registeredCity,
        registeredCounty,
        registeredPostalCode,
        businessType: businessTypeLegal,
        websiteUrl: websiteUrl || undefined,
        businessDescription: businessDescription || undefined,
      });

      setCurrentStep("representative");
    } catch (err: any) {
      setError(err.response?.data?.error || "Eroare la salvarea datelor legale.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveRepresentative = async () => {
    if (!businessId || !fullName || !dateOfBirth || !representativeEmail || !representativePhone) {
      setError("Datele reprezentantului sunt obligatorii.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post("/business-onboarding/representative", {
        businessId,
        fullName,
        cnp: cnp || undefined,
        nationalIdType: nationalIdType || undefined,
        nationalIdSeries: nationalIdSeries || undefined,
        nationalIdNumber: nationalIdNumber || undefined,
        dateOfBirth,
        residenceAddress,
        email: representativeEmail,
        phone: representativePhone,
        roleInCompany,
        beneficialOwner,
      });

      setCurrentStep("bank");
    } catch (err: any) {
      setError(err.response?.data?.error || "Eroare la salvarea datelor reprezentantului.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBankAccount = async () => {
    if (!businessId || !iban || !bankName || !accountHolder) {
      setError("Datele contului bancar sunt obligatorii.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post("/business-onboarding/bank-account", {
        businessId,
        iban,
        bankName,
        accountHolder,
      });

      setCurrentStep("review");
    } catch (err: any) {
      setError(err.response?.data?.error || "Eroare la salvarea contului bancar.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitKYC = async () => {
    if (!businessId) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post("/business-onboarding/submit-kyc", {
        businessId,
      });

      // Redirect către Stripe onboarding
      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl;
      } else {
        router.push("/business/dashboard");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Eroare la trimiterea datelor pentru verificare.");
    } finally {
      setLoading(false);
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <div className="text-white">Se încarcă...</div>
      </div>
    );
  }

  if (user?.role !== "BUSINESS") {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Onboarding Business</h1>
          <p className="text-white/70">Completează datele pentru a-ți activa contul</p>
        </div>

        {/* Progress Steps */}
        <div className="mb-8 flex items-center justify-between">
          {(["business", "legal", "representative", "bank", "review"] as OnboardingStep[]).map((step, idx) => {
            const stepNames: Record<OnboardingStep, string> = {
              business: "Business",
              legal: "Date Legale",
              representative: "Reprezentant",
              bank: "Cont Bancar",
              review: "Review",
            };
            const currentIdx = ["business", "legal", "representative", "bank", "review"].indexOf(currentStep);
            const isActive = idx <= currentIdx;

            return (
              <div key={step} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                      isActive ? "bg-[#6366F1] text-white" : "bg-white/10 text-white/50"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <span className={`text-xs mt-2 ${isActive ? "text-white" : "text-white/50"}`}>
                    {stepNames[step]}
                  </span>
                </div>
                {idx < 4 && (
                  <div className={`h-1 flex-1 mx-2 ${isActive ? "bg-[#6366F1]" : "bg-white/10"}`} />
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-6 bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">{error}</div>
        )}

        {/* Step Content */}
        <div className="bg-[#0B0E17] border border-white/10 rounded-2xl p-8">
          {currentStep === "business" && !businessId && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Informații Business</h2>
              <div>
                <label className="block text-sm font-medium mb-2">Nume Business *</label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  placeholder="Ex: Salonul Meu"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Email Business</label>
                <input
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  placeholder="contact@business.ro"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Tip Business</label>
                <CustomSelect
                  value={businessType}
                  onChange={setBusinessType}
                  options={[
                    { value: "GENERAL", label: "General" },
                    { value: "STOMATOLOGIE", label: "Stomatologie" },
                    { value: "BEAUTY", label: "Beauty" },
                    { value: "OFTALMOLOGIE", label: "Oftalmologie" },
                    { value: "PSIHOLOGIE", label: "Psihologie" },
                    { value: "TERAPIE", label: "Terapie" },
                  ]}
                  placeholder="Selectează tipul de business"
                  size="md"
                  className="w-full"
                />
              </div>
              <button
                onClick={handleRegisterBusiness}
                disabled={loading || !businessName.trim()}
                className="w-full bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
              >
                {loading ? "Se procesează..." : "Continuă"}
              </button>
            </div>
          )}

          {currentStep === "business" && businessId && (
            <div className="space-y-6">
              <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                <p className="text-green-400 text-sm">
                  ✓ Business-ul tău a fost deja creat la înregistrare. Continuă cu următorii pași.
                </p>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2 text-white/50">Nume Business</label>
                  <p className="text-white">{businessName}</p>
                </div>
                {businessEmail && (
                  <div>
                    <label className="block text-sm font-medium mb-2 text-white/50">Email Business</label>
                    <p className="text-white">{businessEmail}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2 text-white/50">Tip Business</label>
                  <p className="text-white">{businessType}</p>
                </div>
              </div>
              <button
                onClick={() => setCurrentStep("legal")}
                className="w-full bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors"
              >
                Continuă la Date Legale
              </button>
            </div>
          )}

          {currentStep === "legal" && businessId && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Date Legale (ONRC)</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Denumire Legală *</label>
                  <input
                    type="text"
                    value={legalEntityName}
                    onChange={(e) => setLegalEntityName(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">CUI/CIF *</label>
                  <input
                    type="text"
                    value={cui}
                    onChange={(e) => setCui(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Nr. Înregistrare ONRC</label>
                  <input
                    type="text"
                    value={tradeRegisterNumber}
                    onChange={(e) => setTradeRegisterNumber(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Tip Business</label>
                  <CustomSelect
                    value={businessTypeLegal}
                    onChange={setBusinessTypeLegal}
                    options={[
                      { value: "SRL", label: "SRL" },
                      { value: "PFA", label: "PFA" },
                      { value: "II", label: "II" },
                      { value: "ONG", label: "ONG" },
                      { value: "SA", label: "SA" },
                    ]}
                    placeholder="Selectează tipul legal"
                    size="md"
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Stradă *</label>
                  <input
                    type="text"
                    value={registeredStreet}
                    onChange={(e) => setRegisteredStreet(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Număr *</label>
                  <input
                    type="text"
                    value={registeredNumber}
                    onChange={(e) => setRegisteredNumber(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Oraș *</label>
                  <input
                    type="text"
                    value={registeredCity}
                    onChange={(e) => setRegisteredCity(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Județ *</label>
                  <input
                    type="text"
                    value={registeredCounty}
                    onChange={(e) => setRegisteredCounty(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Cod Poștal *</label>
                  <input
                    type="text"
                    value={registeredPostalCode}
                    onChange={(e) => setRegisteredPostalCode(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setCurrentStep("business")}
                  className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors"
                >
                  Înapoi
                </button>
                <button
                  onClick={handleSaveLegalInfo}
                  disabled={loading}
                  className="flex-1 bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
                >
                  {loading ? "Se procesează..." : "Continuă"}
                </button>
              </div>
            </div>
          )}

          {currentStep === "representative" && businessId && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Reprezentant Legal (KYC)</h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nume Complet *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">CNP</label>
                  <input
                    type="text"
                    value={cnp}
                    onChange={(e) => setCnp(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Data Nașterii *</label>
                  <input
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={representativeEmail}
                    onChange={(e) => setRepresentativeEmail(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Telefon *</label>
                  <input
                    type="tel"
                    value={representativePhone}
                    onChange={(e) => setRepresentativePhone(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Adresă Reședință *</label>
                  <input
                    type="text"
                    value={residenceAddress}
                    onChange={(e) => setResidenceAddress(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setCurrentStep("legal")}
                  className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors"
                >
                  Înapoi
                </button>
                <button
                  onClick={handleSaveRepresentative}
                  disabled={loading}
                  className="flex-1 bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
                >
                  {loading ? "Se procesează..." : "Continuă"}
                </button>
              </div>
            </div>
          )}

          {currentStep === "bank" && businessId && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Cont Bancar (IBAN)</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">IBAN *</label>
                  <input
                    type="text"
                    value={iban}
                    onChange={(e) => setIban(e.target.value.toUpperCase())}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                    placeholder="RO49 AAAA 1B31 0075 9384 0000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Nume Bancă *</label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Titular Cont *</label>
                  <input
                    type="text"
                    value={accountHolder}
                    onChange={(e) => setAccountHolder(e.target.value)}
                    className="w-full bg-[#0A0D14] border border-white/10 rounded-lg px-4 py-2 text-white"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setCurrentStep("representative")}
                  className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors"
                >
                  Înapoi
                </button>
                <button
                  onClick={handleSaveBankAccount}
                  disabled={loading}
                  className="flex-1 bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
                >
                  {loading ? "Se procesează..." : "Continuă"}
                </button>
              </div>
            </div>
          )}

          {currentStep === "review" && businessId && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Review & Submit</h2>
              <div className="bg-[#0A0D14] rounded-lg p-6 space-y-4">
                <div>
                  <h3 className="font-semibold mb-2">Business:</h3>
                  <p className="text-white/70">{businessName}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Date Legale:</h3>
                  <p className="text-white/70">{legalEntityName}</p>
                  <p className="text-white/70">CUI: {cui}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Reprezentant:</h3>
                  <p className="text-white/70">{fullName}</p>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Cont Bancar:</h3>
                  <p className="text-white/70">{iban}</p>
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setCurrentStep("bank")}
                  className="flex-1 bg-white/10 text-white py-3 rounded-lg font-semibold hover:bg-white/20 transition-colors"
                >
                  Înapoi
                </button>
                <button
                  onClick={handleSubmitKYC}
                  disabled={loading}
                  className="flex-1 bg-[#6366F1] text-white py-3 rounded-lg font-semibold hover:bg-[#4F46E5] transition-colors disabled:opacity-50"
                >
                  {loading ? "Se procesează..." : "Trimite pentru Verificare"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

