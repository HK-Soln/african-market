import type { LegalTexts } from './types';

// DRAFT for legal review (F0-16). Written to match what the platform actually does today; every
// [bracketed] part is a fact the owner or a lawyer must supply before launch. When the reviewed
// text replaces this, change LEGAL_VERSIONS.privacy in @am/contracts.

export const PRIVACY_POLICY: LegalTexts = {
  en: {
    title: 'Privacy policy',
    intro:
      'This policy explains what personal data African Market collects, why, where it is kept and what you can do about it. We follow the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021).',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          'African Market runs the marketplace at africanmarket.ae and its apps. The company responsible for your data is [legal name of the company], trade licence [number], [registered address].',
          'Questions about your data: [privacy contact email].',
        ],
      },
      {
        heading: 'What we collect',
        paragraphs: [
          'Your account: your phone number or email address, and if you add them your name, preferred language and home emirate. If you set a password we keep only a one-way scrambled form of it, never the password itself.',
          'Signing in: when you signed in, and the IP address and browser or device you used, so you can recognise your sessions and we can stop misuse.',
          'Addresses you save for deliveries, including the map pin you drop.',
          'If you sell: your shop details and branches, and the identity documents needed to verify you as a seller.',
          'If you order and pay online (when available): your orders. Card details are entered with Stripe and never reach us.',
        ],
      },
      {
        heading: 'Why we use it',
        paragraphs: [
          'To provide your account and the marketplace you signed up for: signing you in, showing shops near you, putting you in touch with shops and handling your orders.',
          'To keep the service safe: one-time codes, limits on repeated attempts, and looking into fraud or misuse.',
          'To send you offers and news, only if you agreed to it. You can change your mind at any time on your account page.',
        ],
      },
      {
        heading: 'Where it is kept',
        paragraphs: [
          'Your data is stored in the United Arab Emirates, in the UAE region of Amazon Web Services.',
          'Some providers we need to run the service may process data outside the UAE, only for their task: sending one-time codes by WhatsApp or SMS ([provider]), sending emails ([provider]) and verifying sellers’ identity ([provider]). This list will be completed before launch.',
        ],
      },
      {
        heading: 'Who we share it with',
        paragraphs: [
          'A shop you contact or order from receives what it needs to serve you, such as your name, phone number and delivery address.',
          'Service providers who work for us under contract and only on our instructions.',
          'Authorities, when the law requires it.',
          'We do not sell your personal data.',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'For as long as your account is open.',
          'When you delete your account it is closed straight away, and your personal data is erased 30 days later. The 30 days let us look into a mistaken or fraudulent deletion.',
          'One-time codes are deleted after 7 days.',
          'Some records must be kept for longer by law, such as records of orders for tax purposes: [periods to be confirmed].',
        ],
      },
      {
        heading: 'Your rights',
        paragraphs: [
          'You can get a copy of your data: download it from your account page.',
          'You can correct it: edit your profile at any time.',
          'You can delete your account from your account page.',
          'You can withdraw your consent to marketing, and object to or ask us to limit other uses of your data, by contacting us.',
          'If you are not satisfied with our answer, you can complain to the UAE Data Office.',
        ],
      },
      {
        heading: 'Cookies and storage in your browser',
        paragraphs: [
          'We only use what the service needs to work: cookies that keep you signed in (they cannot be read by page scripts), a cookie that remembers your language, and storage in your browser that remembers you have signed in before, that you have seen our cookie notice, and the pages kept for offline use.',
          'We do not use advertising or tracking cookies. If that ever changes, we will ask you first.',
        ],
      },
      {
        heading: 'Age',
        paragraphs: ['You must be [18] or older to create an account.'],
      },
      {
        heading: 'Changes to this policy',
        paragraphs: [
          'When this policy changes we publish the new version here with its date. If a change affects how we use data you have already given us, we will ask you to read it again.',
        ],
      },
    ],
  },
  ar: {
    title: 'سياسة الخصوصية',
    intro:
      'توضح هذه السياسة البيانات الشخصية التي يجمعها أفريكان ماركت، وسبب جمعها، ومكان حفظها، وما يمكنك فعله بشأنها. نلتزم بقانون حماية البيانات الشخصية في دولة الإمارات (المرسوم بقانون اتحادي رقم 45 لسنة 2021).',
    sections: [
      {
        heading: 'من نحن',
        paragraphs: [
          'يدير أفريكان ماركت السوق الإلكتروني على africanmarket.ae وتطبيقاته. الشركة المسؤولة عن بياناتك هي [الاسم القانوني للشركة]، رخصة تجارية [الرقم]، [العنوان المسجل].',
          'للاستفسارات عن بياناتك: [بريد التواصل الخاص بالخصوصية].',
        ],
      },
      {
        heading: 'ما الذي نجمعه',
        paragraphs: [
          'حسابك: رقم هاتفك أو بريدك الإلكتروني، وإن أضفتها: اسمك ولغتك المفضلة وإمارتك. إذا عيّنت كلمة مرور فإننا نحتفظ بصيغة مشفّرة باتجاه واحد فقط، ولا نحتفظ بكلمة المرور نفسها أبدًا.',
          'تسجيل الدخول: وقت تسجيل دخولك، وعنوان IP والمتصفح أو الجهاز الذي استخدمته، لتتعرّف على جلساتك ولنمنع إساءة الاستخدام.',
          'العناوين التي تحفظها للتوصيل، بما فيها الموقع الذي تحدده على الخريطة.',
          'إذا كنت بائعًا: بيانات متجرك وفروعه، ووثائق الهوية اللازمة للتحقق منك كبائع.',
          'إذا طلبت ودفعت عبر الإنترنت (عند توفّر ذلك): طلباتك. تُدخل بيانات البطاقة لدى Stripe ولا تصل إلينا أبدًا.',
        ],
      },
      {
        heading: 'لماذا نستخدمها',
        paragraphs: [
          'لتقديم حسابك والسوق الذي سجلت فيه: تسجيل دخولك، وعرض المتاجر القريبة منك، وتوصيلك بالمتاجر، وتنفيذ طلباتك.',
          'للحفاظ على أمان الخدمة: الرموز لمرة واحدة، والحدّ من المحاولات المتكررة، والتحقيق في الاحتيال أو إساءة الاستخدام.',
          'لإرسال العروض والأخبار إليك، فقط إذا وافقت على ذلك. يمكنك تغيير رأيك في أي وقت من صفحة حسابك.',
        ],
      },
      {
        heading: 'أين تُحفظ',
        paragraphs: [
          'تُحفظ بياناتك في دولة الإمارات العربية المتحدة، في منطقة الإمارات لدى خدمات أمازون السحابية (AWS).',
          'قد يعالج بعض مزوّدي الخدمة الذين نحتاج إليهم بياناتٍ خارج الإمارات، لأداء مهمتهم فقط: إرسال الرموز لمرة واحدة عبر واتساب أو الرسائل النصية ([المزوّد])، وإرسال الرسائل الإلكترونية ([المزوّد])، والتحقق من هوية البائعين ([المزوّد]). ستُستكمل هذه القائمة قبل الإطلاق.',
        ],
      },
      {
        heading: 'مع من نشاركها',
        paragraphs: [
          'يتلقى المتجر الذي تتواصل معه أو تطلب منه ما يحتاجه لخدمتك، مثل اسمك ورقم هاتفك وعنوان التوصيل.',
          'مزوّدو الخدمة الذين يعملون لصالحنا بموجب عقد ووفق تعليماتنا فقط.',
          'الجهات الرسمية، عندما يتطلب القانون ذلك.',
          'لا نبيع بياناتك الشخصية.',
        ],
      },
      {
        heading: 'مدة الاحتفاظ بها',
        paragraphs: [
          'طوال مدة بقاء حسابك مفتوحًا.',
          'عندما تحذف حسابك يُغلق فورًا، وتُمحى بياناتك الشخصية بعد 30 يومًا. تتيح لنا هذه الأيام الثلاثون التحقق من أي حذف تمّ بالخطأ أو بالاحتيال.',
          'تُحذف الرموز لمرة واحدة بعد 7 أيام.',
          'يجب الاحتفاظ ببعض السجلات مدةً أطول بحكم القانون، مثل سجلات الطلبات للأغراض الضريبية: [المدد قيد التأكيد].',
        ],
      },
      {
        heading: 'حقوقك',
        paragraphs: [
          'يمكنك الحصول على نسخة من بياناتك: نزّلها من صفحة حسابك.',
          'يمكنك تصحيحها: عدّل ملفك الشخصي في أي وقت.',
          'يمكنك حذف حسابك من صفحة حسابك.',
          'يمكنك سحب موافقتك على الرسائل التسويقية، والاعتراض على الاستخدامات الأخرى لبياناتك أو طلب تقييدها، بالتواصل معنا.',
          'إذا لم تكن راضيًا عن ردّنا، يمكنك تقديم شكوى إلى مكتب الإمارات للبيانات.',
        ],
      },
      {
        heading: 'ملفات تعريف الارتباط والتخزين في متصفحك',
        paragraphs: [
          'نستخدم فقط ما تحتاجه الخدمة لتعمل: ملفات تعريف ارتباط تُبقيك مسجّلًا للدخول (لا يمكن لنصوص الصفحة قراءتها)، وملف تعريف ارتباط يتذكر لغتك، وتخزينًا في متصفحك يتذكر أنك سجّلت الدخول من قبل، وأنك اطّلعت على إشعار ملفات تعريف الارتباط، والصفحات المحفوظة للاستخدام دون اتصال.',
          'لا نستخدم ملفات تعريف ارتباط إعلانية أو للتتبع. وإذا تغيّر ذلك يومًا، فسنطلب موافقتك أولًا.',
        ],
      },
      {
        heading: 'السن',
        paragraphs: ['يجب أن يكون عمرك [18] عامًا أو أكثر لإنشاء حساب.'],
      },
      {
        heading: 'التغييرات على هذه السياسة',
        paragraphs: [
          'عندما تتغير هذه السياسة ننشر النسخة الجديدة هنا مع تاريخها. وإذا أثّر التغيير في طريقة استخدامنا لبيانات قدّمتها لنا من قبل، فسنطلب منك قراءتها مجددًا.',
        ],
      },
    ],
  },
};
