/**
 * Marketing-site images (landing + solutions pages), served from public/marketing/ (WebP, converted from the
 * supplied design PNGs). Plain URL paths, not bundler imports.
 */
export const marketingAssets = {
  hero: { src: "/marketing/hero-laptop-pedestal.webp", w: 1357, h: 845 },
  stepOnboard: { src: "/marketing/step-onboard.webp", w: 640, h: 607 },
  stepOperate: { src: "/marketing/step-operate.webp", w: 640, h: 445 },
  stepAi: { src: "/marketing/step-ai.webp", w: 640, h: 595 },
  room: { src: "/marketing/room-isometric.webp", w: 1100, h: 825 },
  visitorPass: { src: "/marketing/visitor-pass.webp", w: 560, h: 715 },
  complaintBoard: { src: "/marketing/complaint-board.webp", w: 820, h: 683 },
  roleDashboards: { src: "/marketing/role-dashboards.webp", w: 820, h: 686 },
  aiSuite: { src: "/marketing/ai-suite.webp", w: 640, h: 569 },
  planStarter: { src: "/marketing/plan-starter.webp", w: 720, h: 477 },
  planProfessional: { src: "/marketing/plan-professional.webp", w: 720, h: 555 },
  planEnterprise: { src: "/marketing/plan-enterprise.webp", w: 720, h: 506 },
  ctaBuilding: { src: "/marketing/cta-building.webp", w: 1000, h: 451 },
  mobileApp: { src: "/marketing/mobile-app.webp", w: 1000, h: 1021 },
  devices: { src: "/marketing/devices.webp", w: 1200, h: 625 },
  propertyHostel: { src: "/marketing/property-hostel.webp", w: 1200, h: 528 },
  propertyColiving: { src: "/marketing/property-coliving.webp", w: 1200, h: 528 },
  propertySchool: { src: "/marketing/property-school.webp", w: 1200, h: 675 },
  propertyCoaching: { src: "/marketing/property-coaching.webp", w: 1200, h: 675 },
  propertyCollege: { src: "/marketing/property-college.webp", w: 1200, h: 675 },
  propertyStaff: { src: "/marketing/property-staff.webp", w: 1200, h: 676 },
  founder: { src: "/marketing/founder-vikas-patel.webp", w: 640, h: 912 },
} as const;
