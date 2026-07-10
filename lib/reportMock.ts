import type { ReportGroup, Report } from './reportTypes'

export const MOCK_GROUPS: ReportGroup[] = [
  { id: 'g1', name: 'การประชุมครั้งที่ 1', order: 0 },
  { id: 'g2', name: 'การประชุมครั้งที่ 2', order: 1 },
]

export const MOCK_REPORTS: Report[] = [
  {
    id: 'r1',
    groupId: 'g1',
    presetId: 'default',
    data: {
      projectName: 'แผนงานจัดหาอุปกรณ์ป้องกัน/ตัดตอน/อุปกรณ์ประกอบและอุปกรณ์สำรองสำหรับสายเคเบิลใต้ดิน/ใต้น้ำ ในระบบจำหน่ายและสายส่งไฟฟ้า (ปี 2569-2571)',
      dept: 'กองบริหารจัดการระบบไฟฟ้า (กบร.)',
      section: 'ฝ่ายบริหารจัดการสินทรัพย์ระบบไฟฟ้า',
      fiscalYear: 2570,
      status: 'ต่อเนื่อง',

      basicInfo: {
        responsible: {
          department: 'แผนกจัดการงานบำรุงรักษาอุปกรณ์ป้องกันและตัดตอน',
          division: 'กองบริหารจัดการระบบไฟฟ้า',
          section: 'ฝ่ายบริหารจัดการสินทรัพย์ระบบไฟฟ้า',
          unit: 'ปฏิบัติการระบบไฟฟ้า',
          phone: '5467',
        },
        necessity: 'นโยบายรัฐบาล',
        investmentType: 'บำรุงรักษาระบบไฟฟ้า',
        status: 'ต่อเนื่อง',
        approval: 'ยังไม่ได้รับการอนุมัติ',
        area: 'กฟข. 12 เขต',
        durationYears: 3,
        startYear: 2569,
        endYear: 2571,
        totalInvestment: 742286844,
        yearInvestment: 256813242,
        disbursementTarget: 0,
        operatingBudget: null,
        objectives: [
          'เพื่อเปลี่ยนอุปกรณ์ในระบบจำหน่าย และระบบสายส่งไฟฟ้าทดแทนการชำรุด',
          'เพื่อเปลี่ยนอุปกรณ์ในระบบจำหน่าย และระบบสายส่งไฟฟ้าทดแทนการเสื่อมสภาพการใช้งาน',
          'เพื่อเป็นอุปกรณ์สำรองไว้ใช้งานกรณีซ่อมแซมฉุกเฉิน สำหรับระบบจำหน่าย และระบบสายส่งไฟฟ้าใต้ดิน/ใต้น้ำ',
        ],
      },

      benefits: {
        outputAfterCompletion: 'ดำเนินงานปรับปรุงเพิ่มความมั่นคงระบบจำหน่าย และสายส่งไฟฟ้า ได้อย่างมีประสิทธิภาพ ครบ 100%',
        outcomeAfterCompletion: 'เพิ่มความมั่นคง และรักษาระดับความเชื่อถือได้ของระบบจำหน่าย และระบบสายส่งไฟฟ้าของ กฟภ.',
        outputThisYear: 'ดำเนินงานปรับปรุงเพิ่มความมั่นคงระบบจำหน่าย และสายส่งไฟฟ้า ได้อย่างมีประสิทธิภาพ ครบ 100%',
        outcomeThisYear: 'เพิ่มความมั่นคง และรักษาระดับความเชื่อถือได้ของระบบจำหน่าย และระบบสายส่งไฟฟ้าของ กฟภ.',
        benefitIncreaseRevenue: true,
        benefitReduceCost: true,
        benefitOther: '',
        orgImpact: 'มีการบริหารจัดการอุปกรณ์ไฟฟ้าในระบบจำหน่าย และสายส่งไฟฟ้าเป็นไปอย่างมีประสิทธิภาพ และมีแผนงานดำเนินการที่ชัดเจน',
        communityImpact: 'เพื่อสร้างความมั่นคงและเพิ่มเสถียรภาพของระบบจำหน่ายและสายส่งไฟฟ้า',
        ifNotApprovedImpact: 'อาจทำให้กระทบต่อการเปลี่ยนทดแทนการชำรุดของอุปกรณ์หลัก ซึ่งจะส่งผลต่อความมั่นคงและความเชื่อถือได้ของระบบจำหน่าย 22/33 kV และระบบสายส่ง 115 kV',
        problemsObstacles: 'กระบวนการจัดหาล่าช้า แก้ไขโดยการวางแผนงานและติดตามผลการดำเนินงาน',
      },

      budget: {
        categories: [
          {
            หมวด: 2,
            name: 'สิ่งก่อสร้าง — งานระบบไฟฟ้า (งป.007)',
            formRef: 'งป.007',
            yearAmount: 256813242,
            disbursementByYear: [
              { year: 2570, amount: 0 },
              { year: 2571, amount: 256813242 },
            ],
          },
        ],
        reserve: 8616398,
        reserveByYear: [
          { year: 2570, amount: 8616398 },
          { year: 2571, amount: 0 },
        ],
      },

      equipment: [
        {
          year: 2569,
          items: [
            { no: 1, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 22 เควี 600 แอมป์', details: ['ชุดควบคุมสวิตช์ชนิดภายนอกอาคาร CT, VT', 'ชุดจ่ายไฟชุดควบคุม LOCAL และ INTERFACE และ CONTROL CABINET'], matNo: '1040070009, 1040070305, 1040073011', qty: 359, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 93340000, disbursementByYear: [{ year: 2569, amount: 0 }, { year: 2570, amount: 93340000 }], paymentNote: 'คาดจ่าย มิ.ย 70' },
            { no: 2, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 33 เควี 600 แอมป์', details: ['ชุดควบคุมสวิตช์ชนิดภายนอกอาคาร CT, VT'], matNo: '1040070107, 1040070305, 1040073012', qty: 90, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 23400000, disbursementByYear: [{ year: 2569, amount: 0 }, { year: 2570, amount: 23400000 }], paymentNote: 'คาดจ่าย มิ.ย 70' },
            { no: 7, description: 'VT.3P.O/D 22,000/110-220 V.RCS 500 VA. สำหรับจ่ายไฟให้ชุดควบคุมโหลดเบรคสวิตช์ SF6', details: [], matNo: '1040073011', qty: 65, unit: 'ชิ้น', unitPrice: 51360, priceSource: 'ราคามาตรฐานพัสดุปี 2567 ครั้งที่ 3', totalAmount: 3338400, disbursementByYear: [{ year: 2569, amount: 3338400 }, { year: 2570, amount: 0 }], paymentNote: 'คาดจ่าย ธ.ค. 69' },
            { no: 11, description: 'Disconnecting Switch 22 kV', details: [], matNo: '1040050000', qty: 1296, unit: 'ชิ้น', unitPrice: 5222, priceSource: 'ราคากลางปี 2567 ครั้งที่ 4', totalAmount: 6767712, disbursementByYear: [{ year: 2569, amount: 6767712 }, { year: 2570, amount: 0 }], paymentNote: 'คาดจ่าย ก.ย. 69' },
          ],
        },
        {
          year: 2570,
          items: [
            { no: 1, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 22 เควี 600 แอมป์', details: ['ชุดควบคุมสวิตช์ชนิดภายนอกอาคาร CT, VT', 'ชุดจ่ายไฟชุดควบคุม LOCAL และ INTERFACE และ CONTROL CABINET'], matNo: '1040070009, 1040070305', qty: 362, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 94120000, disbursementByYear: [{ year: 2570, amount: 0 }, { year: 2571, amount: 94120000 }], paymentNote: 'คาดจ่าย มิ.ย 71' },
            { no: 2, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 33 เควี 600 แอมป์', details: ['ชุดควบคุมสวิตช์ชนิดภายนอกอาคาร CT, VT'], matNo: '1040070107, 1040070305', qty: 89, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 23140000, disbursementByYear: [{ year: 2570, amount: 0 }, { year: 2571, amount: 23140000 }], paymentNote: 'คาดจ่าย มิ.ย 71' },
            { no: 3, description: 'Capacitor แรงสูง ระบบ 12.7 kV. 1 เฟส 100 kVAR', details: [], matNo: '1050050000', qty: 750, unit: 'ชิ้น', unitPrice: 9357, priceSource: 'ราคากลางปี 2567 ครั้งที่ 4', totalAmount: 7017750, disbursementByYear: [{ year: 2570, amount: 0 }, { year: 2571, amount: 7017750 }], paymentNote: 'คาดจ่าย ก.ย. 70' },
            { no: 5, description: 'Three phase automatic circuit recloser, solid dielectric insulation type, Rated voltage : 24 kV', details: ['ชุดควบคุมอัตโนมัติ สำหรับรีโคลสเซอร์แบบอิเล็คทรอนิคส์', 'VT.1P.O/D 22,000/230 V.REC.500 VA.'], matNo: '1040080004, 1040080302, 1040073015', qty: 203, unit: 'ชุด', unitPrice: 238400, priceSource: 'ราคากลางปี 2567 ครั้งที่ 4', totalAmount: 48395200, disbursementByYear: [{ year: 2570, amount: 48395200 }, { year: 2571, amount: 0 }], paymentNote: 'คาดจ่าย ธ.ค. 70' },
            { no: 6, description: 'Three phase automatic circuit recloser, solid dielectric insulation type, Rated voltage : 36 kV', details: ['ชุดควบคุมอัตโนมัติ สำหรับรีโคลสเซอร์แบบอิเล็คทรอนิคส์', 'VT.1P.O/D 33,000/230 V.REC.500 VA.'], matNo: '1040080103, 1040080302, 1040073016', qty: 34, unit: 'ชุด', unitPrice: 313000, priceSource: 'ราคากลางปี 2567 ครั้งที่ 4', totalAmount: 10642000, disbursementByYear: [{ year: 2570, amount: 10642000 }, { year: 2571, amount: 0 }], paymentNote: 'คาดจ่าย ธ.ค. 70' },
            { no: 13, description: '115 kV Pole-mounted Load break switches with SF6 Gas Interrupters: rated current 2,000 Amp', details: [], matNo: '1040070202', qty: 8, unit: 'ชุด', unitPrice: 3900000, priceSource: 'ราคามาตรฐานพัสดุปี 2567 ครั้งที่ 3', totalAmount: 31200000, disbursementByYear: [{ year: 2570, amount: 31200000 }, { year: 2571, amount: 0 }], paymentNote: 'คาดจ่าย ธ.ค. 70' },
            { no: 14, description: '115 kV Air break switches, three-pole horizontal opening: rated current 2,000 Amp', details: ['manually group operated type'], matNo: '104060207', qty: 6, unit: 'ชุด', unitPrice: 406900, priceSource: 'ราคากลางปี 2567 ครั้งที่ 4', totalAmount: 2441400, disbursementByYear: [{ year: 2570, amount: 2441400 }, { year: 2571, amount: 0 }], paymentNote: 'คาดจ่าย มิ.ย 70' },
          ],
        },
        {
          year: 2571,
          items: [
            { no: 1, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 22 เควี 600 แอมป์', details: [], matNo: '1040070009', qty: 346, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 89960000, disbursementByYear: [{ year: 2571, amount: 89960000 }], paymentNote: 'คาดจ่าย ธ.ค. 71' },
            { no: 2, description: 'สวิตช์เปิดได้เมื่อมีโหลดสามารถใช้การควบคุมระยะไกล 3 เฟส 33 เควี 600 แอมป์', details: [], matNo: '1040070107', qty: 75, unit: 'ชุด', unitPrice: 260000, priceSource: 'สืบราคาจากบริษัท', totalAmount: 19500000, disbursementByYear: [{ year: 2571, amount: 19500000 }], paymentNote: 'คาดจ่าย ธ.ค. 71' },
          ],
        },
      ],

      procurements: [{
        fiscalYear: 2570,
        activities: [
          {
            id: 'a1',
            name: 'จัดซื้อจัดจ้าง',
            months: [
              { active: true },{ active: true },{ active: true },
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: false },{ active: false },
            ],
          },
          {
            id: 'a2',
            name: 'รอส่งมอบ',
            months: [
              { active: false },{ active: false },{ active: false },
              { active: true },{ active: true },{ active: true },
              { active: true },{ active: true },{ active: false },
              { active: false },{ active: false },{ active: false },
            ],
          },
          {
            id: 'a3',
            name: 'ตรวจรับและทดสอบ',
            months: [
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: true },{ active: true },
              { active: false },{ active: false },{ active: false },
            ],
          },
          {
            id: 'a4',
            name: 'เบิกจ่าย',
            months: [
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: false },{ active: false },
              { active: false },{ active: false },{ active: true, amount: 166841452 },
              { active: false },{ active: false },{ active: true, amount: 89971790 },
            ],
          },
        ],
      }],
    },
  },
  {
    id: 'r2',
    groupId: 'g1',
    presetId: null,
    data: {
      projectName: 'แผนงานปรับปรุงระบบจำหน่ายไฟฟ้าเพื่อเพิ่มความมั่นคง ประจำปี 2570',
      dept: 'กองวางแผนระบบไฟฟ้า (กวฟ.)',
      section: 'ฝ่ายวิศวกรรมระบบไฟฟ้า',
      fiscalYear: 2570,
      status: 'ใหม่',
      basicInfo: {
        responsible: { department: 'แผนกวางแผน', division: 'กองวางแผนระบบไฟฟ้า', section: 'ฝ่ายวิศวกรรม', unit: 'ปฏิบัติการ', phone: '5200' },
        necessity: 'นโยบายกฟภ',
        investmentType: 'ก่อสร้างขยายเขต',
        status: 'ใหม่',
        approval: 'ยังไม่ได้รับการอนุมัติ',
        area: 'กฟข. 5 เขต',
        durationYears: 2,
        startYear: 2570,
        endYear: 2571,
        totalInvestment: 320000000,
        yearInvestment: 160000000,
        disbursementTarget: 80000000,
        operatingBudget: null,
        objectives: ['เพื่อปรับปรุงความมั่นคงของระบบจำหน่ายในพื้นที่เป้าหมาย'],
      },
      benefits: { outputAfterCompletion: '', outcomeAfterCompletion: '', outputThisYear: '', outcomeThisYear: '', benefitIncreaseRevenue: false, benefitReduceCost: true, benefitOther: '', orgImpact: '', communityImpact: '', ifNotApprovedImpact: '', problemsObstacles: '' },
      budget: { categories: [], reserve: 0, reserveByYear: [] },
      equipment: [],
      procurements: [{ fiscalYear: 2570, activities: [] }],
    },
  },
]
