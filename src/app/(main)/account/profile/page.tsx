"use client";

import { useState, useRef } from "react";
// import { useFirebase } from "@/firebase"; // Removed in favor of UserContext
import { useUser } from "@/contexts/UserContext"; // Import UserContext
import { updateProfile } from "firebase/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  ShieldCheck, 
  Sparkles, 
  Save,
  Lock,
  Smartphone,
  Loader2,
  Plus,
  Mail,
  Shield
} from "lucide-react";
import { AvatarUploadModal } from "@/components/profile/AvatarUploadModal";
import { useToast } from "@/hooks/use-toast";

export default function ProfilePage() {
  const { user, updateUser } = useUser(); // Use UserContext
  const { toast } = useToast();
  
  const [activePersona, setActivePersona] = useState<string[]>(user?.investorType || ["🔥 High Risk", "💎 Crypto Native"]);
  const [isDirty, setIsDirty] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  // Avatar State
  // const [avatarUrl, setAvatarUrl] = useState(user?.photoURL || ""); // Driven by Context now
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    displayName: user?.displayName || "",
    bio: user?.bio || "Building wealth with AI.",
  });

  const personas = [
    "🔥 High Risk",
    "🐢 Long Term",
    "💎 Crypto Native",
    "📈 ETF Saver",
    "🤖 AI Bull",
    "🏠 Real Estate",
    "💼 Angel Investor"
  ];

  const handlePersonaToggle = (tag: string) => {
    setIsDirty(true);
    let newPersonas = activePersona;
    if (activePersona.includes(tag)) {
      newPersonas = activePersona.filter(p => p !== tag);
    } else {
      newPersonas = [...activePersona, tag];
    }
    setActivePersona(newPersonas);
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.slice(0, 2).toUpperCase();
  };

  // 1. Handle File Selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        setTempImageSrc(reader.result?.toString() || null);
        setIsModalOpen(true);
      });
      reader.readAsDataURL(file);
      // Reset input so same file can be selected again
      e.target.value = "";
    }
  };

  // 2. Handle Save from Modal (receives already compressed blob)
  const handleAvatarUpload = async (compressedBlob: Blob) => {
    try {
      setIsUploading(true);
      
      // MOCK UPLOAD: Create ObjectURL (In real app, upload to Firebase Storage here)
      // Since we don't have full Firebase Storage setup verified in this context, use ObjectURL for verification
      const newAvatarUrl = URL.createObjectURL(compressedBlob);
      
      // Update User Context (Persists to localStorage)
      updateUser({ photoURL: newAvatarUrl });

      toast({
        title: "Avatar Updated",
        description: "Your new profile photo looks great!",
      });

    } catch (error) {
      console.error("Avatar upload failed:", error);
      toast({
        title: "Upload Failed",
        description: "Could not process the image.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveChanges = () => {
    updateUser({
      displayName: formData.displayName,
      bio: formData.bio,
      investorType: activePersona
    });
    setIsDirty(false);
    toast({
      title: "Profile Saved",
      description: "Your changes have been saved locally.",
    });
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto p-6 pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Profile & Identity</h1>
        <p className="text-muted-foreground">Manage your personal information and digital presence.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
        
        {/* Identity Card */}
        <Card className="bg-gradient-to-br from-violet-500/5 to-transparent border-violet-500/20 overflow-hidden relative">
          <div className="absolute inset-0 bg-grid-white/5 opacity-50" />
          <CardHeader className="relative">
            <CardTitle className="text-lg text-violet-300">Digital Identity</CardTitle>
            <CardDescription>Visual representation across the platform.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6 relative">
            <div className="relative group">
              <Avatar className="h-32 w-32 border-4 border-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all duration-300 group-hover:scale-105 group-hover:border-violet-500/50">
                <AvatarImage src={user?.photoURL || ''} className="object-cover" />
                <AvatarFallback className="text-4xl bg-violet-950 text-violet-200">
                  {getInitials(user?.displayName)}
                </AvatarFallback>
              </Avatar>
              
              <label 
                htmlFor="avatar-upload" 
                className="absolute bottom-0 right-0 p-2 rounded-full bg-violet-600 text-white cursor-pointer hover:bg-violet-700 transition-colors shadow-lg hover:scale-110 active:scale-95"
                title="Upload avatar"
              >
                {user?.photoURL ? <Camera size={18} /> : <Plus size={18} />}
              </label>
              <input 
                id="avatar-upload"
                type="file" 
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                title="Upload avatar"
              />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-xl">{formData.displayName || user?.displayName || 'User'}</h3>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
            </div>

            <div className="flex gap-2">
               <span className="px-2 py-1 rounded bg-violet-500/10 text-violet-300 text-xs border border-violet-500/20">
                 Pro Member
               </span>
               <span className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 text-xs border border-emerald-500/20">
                 Verified
               </span>
            </div>
          </CardContent>
        </Card>

        {/* Details Form - Right Column */}
        <div className="space-y-6">
           
           {/* Block: Identity Form */}
           <Card className="bg-black/20 border-white/5 backdrop-blur-md">
             <CardHeader>
                <div className="flex items-center gap-2">
                   <div className="p-2 rounded-lg bg-white/5">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                   </div>
                   <CardTitle className="text-lg">Identity Details</CardTitle>
                </div>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="grid gap-2">
                   <Label htmlFor="display-name" className="text-xs font-mono text-white/50 uppercase tracking-wider">Display Name</Label>
                   <Input 
                      id="display-name" 
                      value={formData.displayName} 
                      onChange={(e) => {
                        setFormData({...formData, displayName: e.target.value});
                        setIsDirty(true);
                      }}
                      className="bg-black/30 border-white/10 text-white focus:border-violet-500/50 focus:ring-violet-500/20"
                   />
                </div>

                <div className="grid gap-2">
                   <Label htmlFor="email" className="text-xs font-mono text-white/50 uppercase tracking-wider">Email Address</Label>
                   <div className="relative">
                     <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                     <Input 
                        id="email" 
                        value={user?.email || ""} 
                        disabled
                        className="pl-9 bg-white/5 border-transparent text-white/50 cursor-not-allowed"
                     />
                   </div>
                   <p className="text-[0.8rem] text-muted-foreground">Email cannot be changed.</p>
                </div>

                <div className="grid gap-2">
                   <Label htmlFor="bio" className="text-xs font-mono text-white/50 uppercase tracking-wider">Bio</Label>
                   <Textarea 
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => {
                        setFormData({...formData, bio: e.target.value});
                        setIsDirty(true);
                      }}
                      className="bg-black/30 border-white/10 text-white min-h-[100px] resize-none focus:border-violet-500/50 focus:ring-violet-500/20"
                   />
                </div>
             </CardContent>
           </Card>

           {/* Block: Investor DNA */}
           <Card className="bg-black/20 border-white/5 backdrop-blur-md">
             <CardHeader>
                <div className="flex items-center gap-2">
                   <div className="p-2 rounded-lg bg-white/5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                   </div>
                   <CardTitle className="text-lg">Investor DNA</CardTitle>
                </div>
             </CardHeader>
             <CardContent>
               <div className="flex flex-wrap gap-2">
                  {personas.map((tag) => {
                     const isActive = activePersona.includes(tag);
                     return (
                        <button
                          key={tag}
                          onClick={() => handlePersonaToggle(tag)}
                          className={`
                            px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border
                            ${isActive 
                              ? "bg-violet-500/20 border-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]" 
                              : "bg-transparent border-white/10 text-muted-foreground hover:border-white/30 hover:text-white"
                            }
                          `}
                        >
                          {tag}
                        </button>
                     );
                  })}
               </div>
               <p className="mt-4 text-xs text-white/40">Select the tags that best describe your investment style.</p>
             </CardContent>
           </Card>

           {/* Block: Security */}
           <Card className="bg-black/20 border-white/5 backdrop-blur-md">
             <CardHeader>
                <div className="flex items-center gap-2">
                   <div className="p-2 rounded-lg bg-white/5">
                      <Lock className="w-4 h-4 text-amber-400" />
                   </div>
                   <CardTitle className="text-lg">Security</CardTitle>
                </div>
             </CardHeader>
             <CardContent className="space-y-4">
               <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
                  <div className="hidden sm:flex flex-col">
                     <span className="text-sm font-medium text-white">Password</span>
                     <span className="text-xs text-white/40 tracking-widest">•••••••••••••</span>
                  </div>
                  <div className="flex sm:hidden items-center gap-2">
                     <Shield className="h-4 w-4 text-white" />
                     <span className="text-sm font-medium text-white">Password</span>
                  </div>
                  <Button variant="outline" size="sm" className="border-white/10 bg-transparent text-white/80 hover:bg-white/5 hover:text-white">
                     Update
                  </Button>
               </div>
               
               <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors opacity-70">
                  <div className="flex items-center gap-3">
                     <Smartphone className="w-4 h-4 text-white/40" />
                     <div className="flex flex-col opacity-60">
                        <span className="text-sm font-medium text-white">2-Factor Auth</span>
                        <span className="text-xs text-white/40">Not configured</span>
                     </div>
                  </div>
                  <div className="h-5 w-9 rounded-full bg-white/10 p-1">
                     <div className="h-3 w-3 rounded-full bg-white/30" />
                  </div>
               </div>
             </CardContent>
           </Card>

        </div>
      </div>

      {/* Floating Save Button */}
      {isDirty && (
        <div className="fixed bottom-6 right-6 md:right-10 animate-in slide-in-from-bottom-5 duration-300 z-50">
           <Button onClick={handleSaveChanges} className="bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.5)] border border-violet-400/50 rounded-full px-8 h-12 gap-2">
              <Save className="w-4 h-4" />
              Save Changes
           </Button>
        </div>
      )}

      {/* Avatar Upload Modal */}
      <AvatarUploadModal 
        isOpen={isModalOpen} 
        onClose={() => {
           setIsModalOpen(false);
           setTempImageSrc(null);
        }} 
        imageSrc={tempImageSrc} 
        onUpload={handleAvatarUpload}
      />
    </div>
  );
}
